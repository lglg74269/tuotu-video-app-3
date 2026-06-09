// ============================================================
// 从完整原文中按相邻单元 ct 边界推断某一单元的 ct（用于 ct 为空时的修复）
// ============================================================

/**
 * @param {import('../types.js').Storyboard} storyboard
 * @param {string} originalText
 * @param {number} unitId
 * @returns {string}
 */
export function inferUnitCtFromOriginal(storyboard, originalText, unitId) {
  const units = [...(storyboard?.storys || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  const idx = units.findIndex((u) => u.id === unitId);
  if (idx < 0) return '';

  const unit = units[idx];
  if (unit.ct && String(unit.ct).trim()) return String(unit.ct);

  const before = units.slice(0, idx).map((u) => u.ct || '').join('');
  const after = units.slice(idx + 1).map((u) => u.ct || '').join('');
  const start = before.length;
  const end = originalText.length - after.length;
  if (start <= end) return originalText.slice(start, end);
  return '';
}
