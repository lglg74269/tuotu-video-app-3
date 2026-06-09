// ============================================================
// 原文按字数分段（尽量在段落/句号处切分，供分镜拆分步骤使用）
// ============================================================

/** 在 pos 附近找更自然的切分点（向前找） */
function findBreak(text, pos, minPos) {
  const slice = text.slice(minPos, pos);
  const breaks = ['\n\n', '\n', '。', '！', '？', '；', '，', ' '];
  for (const ch of breaks) {
    const idx = slice.lastIndexOf(ch);
    if (idx >= 0 && minPos + idx + ch.length >= minPos + Math.floor((pos - minPos) * 0.5)) {
      return minPos + idx + ch.length;
    }
  }
  return pos;
}

/**
 * 把长文本切成若干段，每段不超过 maxChars
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
export function segmentTextByChars(text, maxChars) {
  const t = String(text || '');
  if (!t.trim()) return [];
  const limit = Math.max(100, Number(maxChars) || 500);
  if (t.length <= limit) return [t];

  const chunks = [];
  let start = 0;
  while (start < t.length) {
    if (t.length - start <= limit) {
      chunks.push(t.slice(start));
      break;
    }
    let end = start + limit;
    end = findBreak(t, end, start);
    if (end <= start) end = start + limit;
    chunks.push(t.slice(start, end));
    start = end;
  }
  return chunks;
}

/** 拼接带分集标题的原文（资产提取 2b 用） */
export function formatEpisodesWithTitles(episodes) {
  return (episodes || [])
    .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.text || ''}`)
    .join('\n\n');
}
