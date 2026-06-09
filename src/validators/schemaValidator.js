// ============================================================
// 分镜结构校验（程序层仅硬性检查 ds）
// ct 由 ctRestoreValidator 单独校验；其余字段由提示词约束、程序不拦
// ============================================================

/**
 * 视频提示词数组结构校验
 * @param {import('../types.js').VideoPromptUnit[]} arr
 */
export function validateVideoPromptSchema(arr) {
  const issues = [];
  if (!Array.isArray(arr)) {
    issues.push({ level: 'error', code: 'VP_NOT_ARRAY', message: '视频提示词输出必须为 JSON 数组' });
    return { pass: false, issues };
  }
  arr.forEach((item, i) => {
    if (typeof item.n !== 'number') issues.push({ level: 'error', code: 'VP_NO_N', message: `第 ${i} 个提示词缺少数字 n` });
    if (!item.p || !String(item.p).trim()) issues.push({ level: 'error', code: 'VP_NO_P', message: `第 ${i} 个提示词缺少内容 p` });
    if (!Array.isArray(item.dlgs)) issues.push({ level: 'warning', code: 'VP_DLGS_TYPE', message: `第 ${i} 个提示词 dlgs 应为数组` });
  });
  const hasError = issues.some((x) => x.level === 'error');
  return { pass: !hasError, issues };
}
