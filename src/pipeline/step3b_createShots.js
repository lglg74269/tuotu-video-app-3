// ============================================================
// Step3b-2 镜头创作：对一批已拆分单元（有 id/loc/ct）生成 shots
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { assetBlocks, pickVer, subsetByAppearance } from './_shared.js';

import { ctTextsEquivalent, normalizeCtCore } from '../utils/ctCompare.js';

/** 镜头字段宽松归一化：保证结构可解析，空值由下游补全 */
export function normalizeShot(s) {
  const dlg = s?.dlg;
  const vo = s?.vo;
  return {
    id: s?.id,
    sc: s?.sc != null ? String(s.sc) : '',
    ag: s?.ag != null ? String(s.ag) : '',
    mv: s?.mv != null ? String(s.mv) : '',
    ds: s?.ds != null ? String(s.ds) : '',
    ct: s?.ct != null ? String(s.ct) : '',
    dlg: dlg && typeof dlg === 'object' && !Array.isArray(dlg) ? dlg : {},
    vo: vo && typeof vo === 'object' && !Array.isArray(vo) ? vo : {},
    dur: typeof s?.dur === 'number' && s.dur > 0 ? s.dur : 1.5,
    chars: Array.isArray(s?.chars) ? s.chars : [],
    itm: Array.isArray(s?.itm) ? s.itm : [],
  };
}

function getShotTextForNarration(s) {
  if (s.dlg && Object.keys(s.dlg).length > 0) {
    let text = '';
    for (const sp in s.dlg) text += String(s.dlg[sp] || '');
    if (text.trim()) return text;
  }
  return s.ct || '';
}

function validateShotsResult(storys, originalUnits, mode) {
  const issues = [];
  for (const u of originalUnits) {
    const generated = storys.find(s => s.id === u.id);
    if (!generated) {
      issues.push({ level: 'error', code: 'UNIT_MISSING', message: `大模型未返回单元 ${u.id} 的结果` });
      continue;
    }
    const shots = generated.shots;
    if (!Array.isArray(shots) || shots.length === 0) {
      issues.push({ level: 'error', code: 'UNIT_NO_DS', message: `单元 ${u.id} 无 shots` });
      continue;
    }
    
    shots.forEach((s, si) => {
      const ds = s?.ds != null ? String(s.ds).trim() : '';
      if (!ds) {
        issues.push({ level: 'error', code: 'SHOT_NO_DS', message: `单元 ${u.id} 镜头 ${si + 1} 缺少画面描述 ds` });
      }
    });

    if (mode === 'narration') {
      const shotTextJoined = shots.map(s => getShotTextForNarration(s)).join('');
      if (!ctTextsEquivalent(shotTextJoined, u.ct || '')) {
        const normShot = normalizeCtCore(shotTextJoined);
        const normUnit = normalizeCtCore(u.ct || '');
        issues.push({
          level: 'error',
          code: 'CT_SHOTS_MISMATCH',
          message: `单元 ${u.id} 内部镜头的文本拼合（${normShot.length}字）与该单元应该包含的原文（${normUnit.length}字）不匹配`
        });
      }
    }
  }
  return issues;
}

/**
 * @param {{
 *   mode, units, assets, appearance, analysis,
 *   creativeOverride, episodeText
 * }} args
 */
export async function createShotsForUnits(args) {
  const {
    mode,
    units,
    assets,
    appearance,
    analysis,
    creativeOverride,
    episodeText,
    signal,
  } = args;

  const systemKey = mode === 'script' ? 'step3b-shots.system.script' : 'step3b-shots.system.narration';
  const creativeKey = mode === 'script' ? 'step3b-shots.creative.script' : 'step3b-shots.creative.narration';

  const sysVer = await getActiveVersion(systemKey);
  const creVer = await getActiveVersion(creativeKey);
  const usingOverride = !!(creativeOverride && creativeOverride.trim());
  const creative = usingOverride ? creativeOverride : creVer.content;

  const scopedAssets = appearance ? subsetByAppearance(assets, appearance) : assets;
  const blocks = assetBlocks(scopedAssets);

  const unitsJson = JSON.stringify(units || [], null, 2);
  const targetText = (units || []).map(u => u.ct || '').join('\n\n');
  const prompt = fillTemplate(sysVer.content, {
    creative_block: creative,
    analysis: JSON.stringify(analysis || {}, null, 2),
    strategy: analysis?.recommended_strategy || 'balanced',
    characters_looks: blocks.characters_looks,
    scenes: blocks.scenes,
    items: blocks.items,
    units_json: unitsJson,
    episode_text: episodeText || '',
    target_text: targetText,
  });

  let attempt = 0;
  let content = '';
  let parsed = null;
  let storys = [];
  let meta = null;

  while (attempt < 3) {
    attempt++;
    const res = await callLLM(prompt, { expectJson: true, nodeKey: 'step3b-shots', signal });
    content = res.content;
    parsed = res.parsed;
    
    meta = {
      model: await getNodeModel('step3b-shots'),
      prompts: [pickVer(sysVer), pickVer(creVer, usingOverride ? '前端覆盖' : null)],
    };

    storys = parsed?.storys || parsed?.units || [];
    const issues = validateShotsResult(storys, units, mode);
    
    if (issues.length === 0) {
      break; // 校验全部通过
    } else {
      console.log(`[Step3b-2] 镜头生成校验失败 (第${attempt}次尝试) - 问题: ${issues.map(i => i.message).join('; ')}`);
      if (attempt === 3) {
        console.log(`[Step3b-2] 已达到最大重试次数 (3)，直接采用带瑕疵的结果。`);
      }
    }
  }

  // 确保保留原 ct/loc/id
  const merged = (units || []).map((u) => {
    const found = storys.find((s) => s.id === u.id) || {};
    return {
      ...u,
      ...found,
      ct: u.ct,
      loc: found.loc || u.loc,
      shots: (found.shots || []).map((s) => normalizeShot(s)),
    };
  });

  return { payload: prompt, raw: content, storys: merged, meta };
}
