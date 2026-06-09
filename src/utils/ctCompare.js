// ============================================================
// ct 原文比对：忽略空白/标点差异，允许分集未纳入的章节小标题（如 2.）
// ============================================================

/** 归一化：去空白与标点，仅保留中英数字 */
export function normalizeCtCore(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
}

/** 去掉开头章节/集数标记（归一化后的 core 串） */
export function stripLeadingEpisodeMarker(core) {
  let s = String(core || '');
  s = s.replace(/^第[0-9一二三四五六七八九十百千万]+[章节集部]/, '');
  s = s.replace(/^\d+/, '');
  return s;
}

const PREFIX_TOLERANCE = 8; // 允许分集标题等造成的首部少量差异

/**
 * 判断两段文本在 ct 语义上是否等价（程序校验用，较提示词约束宽松）
 * @param {string} joined ct 拼接结果
 * @param {string} original 对照原文（建议用各集 text 拼接，而非含分集标题的全文）
 */
export function ctTextsEquivalent(joined, original) {
  const a = normalizeCtCore(joined);
  const b = normalizeCtCore(original);
  if (a === b) return true;
  if (!a || !b) return a === b;

  const sa = stripLeadingEpisodeMarker(a);
  const sb = stripLeadingEpisodeMarker(b);
  if (sa === sb) return true;

  // 一侧多出的首部内容（如全文带「2.」、分集正文不带）
  if (sa.length > sb.length && sa.length - sb.length <= PREFIX_TOLERANCE && sa.endsWith(sb)) return true;
  if (sb.length > sa.length && sb.length - sa.length <= PREFIX_TOLERANCE && sb.endsWith(sa)) return true;

  if (sa.startsWith(sb) || sb.startsWith(sa)) {
    if (Math.abs(sa.length - sb.length) <= PREFIX_TOLERANCE) return true;
  }

  return false;
}
