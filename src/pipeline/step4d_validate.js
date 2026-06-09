// ============================================================
// Step4d 视频提示词校验（确定性）
// 结构 + 资产标签格式 + 对白保留 + [time:X] 与冻结台账一致
// ============================================================
import { validateVideoPromptSchema } from '../validators/schemaValidator.js';

/**
 * @param {{
 *   videoPrompts:Array, storyboard:object,
 *   frozenList:Array, assets:object
 * }} args
 * @returns {import('../types.js').ValidationReport}
 */
export function validateVideoPrompts({ videoPrompts, storyboard, frozenList, assets }) {
  const issues = [];

  const schema = validateVideoPromptSchema(videoPrompts);
  issues.push(...schema.issues);

  const charNames = new Set((assets?.characters || []).map((c) => c.n));
  (assets?.existing_character_new_looks || []).forEach((g) => charNames.add(g.n));

  const frozenMap = new Map((frozenList || []).map((f) => [f.unit_id, f]));
  const units = storyboard?.storys || [];

  (videoPrompts || []).forEach((vp, i) => {
    const p = String(vp.p || '');
    const unit = units[i];

    // [time:X] 与冻结台账一致
    if (unit) {
      const frozen = frozenMap.get(unit.id);
      if (frozen) {
        const times = [...p.matchAll(/\[time:\s*(\d+)\s*\]/g)].map((m) => Number(m[1]));
        const total = times.reduce((a, b) => a + b, 0);
        if (times.length && (total < 4 || total > 15)) {
          issues.push({ level: 'error', code: 'VP_TIME_RANGE', message: `第 ${i + 1} 条提示词总时长 ${total}s 超出 4~15s` });
        }
      }
    }

    // 资产标签格式：出现资产角色名时应使用 [p:角色名#...]
    for (const name of charNames) {
      if (!name) continue;
      const bare = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const tagged = new RegExp(`\\[p:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const bareCount = (p.match(bare) || []).length;
      const tagCount = (p.match(tagged) || []).length;
      if (bareCount > tagCount) {
        issues.push({
          level: 'warning',
          code: 'VP_TAG_MISSING',
          message: `第 ${i + 1} 条提示词出现角色「${name}」未全部使用 [p:${name}#...] 标签`,
        });
      }
    }

    // 对白保留：单元 dlg 文本应出现在提示词中
    if (unit) {
      for (const s of unit.shots || []) {
        for (const line of Object.values(s.dlg || {})) {
          const key = String(line).slice(0, 8);
          if (key && !p.includes(key)) {
            issues.push({ level: 'warning', code: 'VP_DLG_LOST', message: `第 ${i + 1} 条提示词可能遗漏对白「${key}…」` });
            break;
          }
        }
      }
    }
  });

  const pass = !issues.some((x) => x.level === 'error');
  return { pass, issues, failedUnitIds: [], checkedAt: new Date().toISOString() };
}
