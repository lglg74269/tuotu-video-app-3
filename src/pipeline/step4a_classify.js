// ============================================================
// Step4a 镜头分类：模型只做一件事 —— 给每个剧情单元打类型标签
// 输出极简 [{unit_id, type}]，稳定可靠
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { storyboardToLedger, pickVer } from './_shared.js';

const VALID_TYPES = ['动作戏,无台词', '动作戏,有台词', '表情情感戏', '特殊运镜戏', '基础文戏'];

/**
 * @param {{storyboard:object, mode:'narration'|'script'}} args
 */
export async function classifyShots({ storyboard, mode }) {
  const sysVer = await getActiveVersion('step4a.system');
  const ledger = storyboardToLedger(storyboard);
  const prompt = fillTemplate(sysVer.content, {
    mode: mode === 'script' ? '剧本' : '解说',
    storyboards: ledger,
    valid_types: VALID_TYPES.join(' / '),
  });
  const { content, parsed } = await callLLM(prompt, { expectJson: true, maxTokens: 4000, nodeKey: 'step4a' });

  const list = Array.isArray(parsed) ? parsed : parsed?.classifications || [];
  const map = new Map();
  for (const item of list) {
    if (item && item.unit_id != null && VALID_TYPES.includes(item.type)) {
      map.set(item.unit_id, item.type);
    }
  }
  // 兜底：未分类单元按是否有对白给默认
  const result = (storyboard.storys || []).map((u) => {
    let type = map.get(u.id);
    if (!type) {
      const hasDlg = (u.shots || []).some((s) => Object.keys(s.dlg || {}).length > 0);
      type = hasDlg ? '基础文戏' : '动作戏,无台词';
    }
    return { unit_id: u.id, type };
  });

  const meta = { model: await getNodeModel('step4a'), prompts: [pickVer(sysVer)] };
  return { payload: prompt, raw: content, parsed: result, meta };
}
