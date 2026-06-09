// ============================================================
// 拆分阶段校验：ct 100% 还原 + 基础字段检查
// ============================================================
import { ctTextsEquivalent, normalizeCtCore } from '../utils/ctCompare.js';

/**
 * @param {{ units: {id:number,loc?:object,ct:string}[] }} splitResult
 * @param {string} originalText
 * @param {'narration'|'script'} mode
 */
export function validateSplitUnits(splitResult, originalText, mode = 'narration') {
  const issues = [];
  const units = [...(splitResult?.units || splitResult?.storys || [])].sort((a, b) => (a.id || 0) - (b.id || 0));

  if (!units.length) {
    issues.push({ level: 'error', code: 'SPLIT_EMPTY', message: '拆分结果为空' });
    return { pass: false, issues };
  }

  for (const u of units) {
    if (!u.ct || !String(u.ct).trim()) {
      issues.push({ level: 'error', unitId: u.id, code: 'CT_EMPTY', message: `单元 ${u.id} 的 ct 为空` });
    }
    if (!u.loc?.n) {
      issues.push({ level: 'warning', unitId: u.id, code: 'LOC_MISSING', message: `单元 ${u.id} 缺少 loc.n` });
    }
  }

  const joined = units.map(u => u.ct || '').join('');
  if (!ctTextsEquivalent(joined, originalText)) {
    issues.push({
      level: 'error',
      code: 'CT_RESTORE_MISMATCH',
      message: '拆分后原文拼合与原文本不一致，发生漏字或幻觉',
    });
  }

  const hasError = issues.some((i) => i.level === 'error');
  return { pass: !hasError, issues };
}
