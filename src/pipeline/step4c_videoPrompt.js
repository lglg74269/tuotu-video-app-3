// ============================================================
// Step4c 视频提示词创作（按单元类型选对应创作模版，单元级生成，最稳）
// 系统提示词(后端) + 该类型创作模版(前端可编辑) + 冻结时长 + 资产 + 单元台账
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { assetBlocks, storyboardToLedger, pickVer } from './_shared.js';

const TYPE_TO_CREATIVE_KEY = {
  '动作戏,无台词': 'step4c.creative.动作戏',
  '动作戏,有台词': 'step4c.creative.动作戏',
  '表情情感戏': 'step4c.creative.表情情感戏',
  '特殊运镜戏': 'step4c.creative.特殊运镜戏',
  '基础文戏': 'step4c.creative.基础文戏',
};

/**
 * 为单个剧情单元生成视频提示词
 * @param {{
 *   mode:'narration'|'script',
 *   unit:object, type:string, frozen:object,
 *   assets:object, n:number,
 *   creativeOverrides?:Record<string,string>,
 *   episodeText?:string,
 *   unitEpisodeIndex?:number|null,
 *   unitText?:string
 * }} args
 */
export async function createVideoPromptForUnit(args) {
  const { mode, unit, type, frozen, assets, n, creativeOverrides, episodeText, unitEpisodeIndex, unitText } = args;

  const systemKey = mode === 'script' ? 'step4c.system.script' : 'step4c.system.narration';
  const creativeKey = TYPE_TO_CREATIVE_KEY[type] || 'step4c.creative.基础文戏';

  const sysVer = await getActiveVersion(systemKey);
  const creVer = await getActiveVersion(creativeKey);
  const usingOverride = !!(creativeOverrides && creativeOverrides[creativeKey]?.trim());
  const creative = usingOverride ? creativeOverrides[creativeKey] : creVer.content;

  const blocks = assetBlocks(assets);
  const ledger = storyboardToLedger({ storys: [unit] });

  // 优先使用传入的 frozen，否则从上游单元自动提取时长
  const resolvedFrozen = frozen || extractFrozenFromUnit(unit, mode);
  const frozenText = resolvedFrozen
    ? resolvedFrozen.shots.map((s) => `分镜${s.index + 1} [time:${s.time}]`).join('\n') + `\n单元总时长：${resolvedFrozen.total_time}s`
    : '（无）';

  const prompt = fillTemplate(sysVer.content, {
    creative_block: creative,
    shot_type: type,
    frozen_durations: frozenText,
    global_style: blocks.global_style,
    characters_looks: blocks.characters_looks,
    scenes: blocks.scenes,
    items: blocks.items,
    storyboards: ledger,
    unit_index: String(n),
    episode_text: episodeText || '（无）',
    unit_episode_index: unitEpisodeIndex != null ? String(unitEpisodeIndex) : '未知',
    unit_text: unitText || '（无）',
  });

  const { content, parsed } = await callLLM(prompt, { expectJson: true, nodeKey: 'step4c' });
  const unitResult = normalizeOne(parsed, n, unit);
  const meta = {
    model: await getNodeModel('step4c'),
    prompts: [pickVer(sysVer), pickVer(creVer, usingOverride ? '前端覆盖（未保存为版本）' : null)],
  };
  return { payload: prompt, raw: content, parsed: unitResult, meta };
}

function normalizeOne(parsed, n, unit) {
  let obj = parsed;
  if (Array.isArray(parsed)) obj = parsed[0];
  if (!obj || typeof obj !== 'object') {
    obj = { n, p: '', dlgs: [] };
  }
  // 兜底 dlgs：从单元 dlg 收集说话者
  if (!Array.isArray(obj.dlgs)) {
    const set = new Set();
    (unit.shots || []).forEach((s) => Object.keys(s.dlg || {}).forEach((k) => set.add(k)));
    obj.dlgs = [...set];
  }
  obj.n = n;
  return obj;
}

/**
 * 从上游单元自动提取时长台账
 * - 解说模式：归并后的单元有 totalTime，shots 是 { originalId, ct, loc, shots }
 * - 剧本模式：单元 shots 有 dur 字段（step3b 模型计算）
 */
function extractFrozenFromUnit(unit, mode) {
  const shots = unit.shots || [];
  if (!shots.length) return null;

  const isGrouped = shots[0] && Array.isArray(shots[0].shots);

  if (isGrouped) {
    // Grouped structure (nested original units)
    const flatShots = [];
    for (const ou of shots) {
      if (ou.shots && Array.isArray(ou.shots)) {
        for (const s of ou.shots) {
          flatShots.push({ ...s, parentUnitCt: ou.ct });
        }
      }
    }

    if (mode === 'script') {
      // Script mode: use the actual corrected durations of individual shots
      const shotTimes = flatShots.map((s) => Math.round(s.dur || 1));
      const total = shotTimes.reduce((a, b) => a + b, 0);
      return {
        unit_id: unit.id,
        total_time: total,
        shots: flatShots.map((s, i) => ({ index: i, time: shotTimes[i], voiceText: s.ct || s.parentUnitCt || '' })),
      };
    } else {
      // Narration mode: distribute totalTime equally among shots
      const total = unit.totalTime || 0;
      const perShot = Math.max(1, Math.floor(total / flatShots.length));
      const remainder = total - perShot * flatShots.length;
      const times = flatShots.map((_, i) => perShot + (i < remainder ? 1 : 0));
      return {
        unit_id: unit.id,
        total_time: total,
        shots: flatShots.map((s, i) => ({ index: i, time: times[i], voiceText: s.ct || s.parentUnitCt || '' })),
      };
    }
  }

  // Flat structure (raw units/scenes)
  const shotTimes = shots.map((s) => Math.round(s.dur || 1));
  const total = shotTimes.reduce((a, b) => a + b, 0);
  return {
    unit_id: unit.id,
    total_time: total,
    shots: shots.map((s, i) => ({ index: i, time: shotTimes[i], voiceText: s.ct || '' })),
  };
}
