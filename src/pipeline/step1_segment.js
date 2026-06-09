// ============================================================
// Step1 分集（严格按 Seedance_Novel_Segmenter 策略实现）
// 策略：模型只识别顶层「集/章」标题锚点；程序负责切批、去重、按锚点切分、超长段均分
//   1) 预处理   2) ~10000字/批 + 200字重叠   3) 并发请求模型识别锚点(json_object,重试3次)
//   4) 局部严格匹配去重   5) 游标按锚点切分原文   6) 超长段在段落/句号处均分
// ============================================================
import { callLLM, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { pickVer } from './_shared.js';

const BATCH_SIZE = 10000;
const OVERLAP = 200;

export function preprocessText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoBatches(text, batchSize, overlapSize) {
  const batches = [];
  let pos = 0;
  let prevCutEnd = 0;
  while (pos < text.length) {
    let end = pos + batchSize;
    if (end < text.length) {
      let cutAt = end;
      for (let i = end; i > Math.max(pos + Math.floor(batchSize / 2), end - 500); i--) {
        if (text[i] === '\n') { cutAt = i + 1; break; }
      }
      end = cutAt;
    } else {
      end = text.length;
    }
    const batchStart = batches.length === 0 ? 0 : Math.max(0, prevCutEnd - overlapSize);
    const overlapLen = batches.length === 0 ? 0 : prevCutEnd - batchStart;
    batches.push({ id: batches.length, text: text.substring(batchStart, end), origStart: batchStart, origEnd: end, overlapLen });
    prevCutEnd = end;
    pos = end;
  }
  return batches;
}

function deduplicateByBatch(batchResults) {
  const allMatches = [];
  for (const batch of batchResults) {
    if (!batch.markers || batch.markers.length === 0) continue;
    let localNormText = '';
    const localNormMap = [];
    for (let i = 0; i < batch.text.length; i++) {
      if (/[\u4e00-\u9fa5a-zA-Z0-9]/.test(batch.text[i])) {
        localNormText += batch.text[i];
        localNormMap.push(i);
      }
    }
    function localFuzzyFind(snippet, contextAfter, fromNorm) {
      if (!snippet) return null;
      const base = snippet.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
      if (!base) return null;
      const ctx = contextAfter ? contextAfter.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') : '';
      const minLen = Math.min(10, base.length);
      for (let len = base.length; len >= minLen; len--) {
        const seg = base.slice(0, len);
        let searchPos = fromNorm;
        let bestFallback = null;
        while (searchPos < localNormText.length) {
          const pos = localNormText.indexOf(seg, searchPos);
          if (pos === -1) break;
          if (!ctx) return { normIdx: pos, normLen: len };
          const afterText = localNormText.substring(pos + len, pos + len + 30);
          const ctxMinLen = Math.min(5, ctx.length);
          if (ctxMinLen === 0 || afterText.includes(ctx.slice(0, ctxMinLen))) return { normIdx: pos, normLen: len };
          if (!bestFallback) bestFallback = { normIdx: pos, normLen: len };
          searchPos = pos + 1;
        }
        if (fromNorm > 0) {
          const pos = localNormText.indexOf(seg);
          if (pos !== -1 && pos < fromNorm) {
            if (!ctx) return { normIdx: pos, normLen: len };
            const afterText = localNormText.substring(pos + len, pos + len + 30);
            const ctxMinLen = Math.min(5, ctx.length);
            if (ctxMinLen === 0 || afterText.includes(ctx.slice(0, ctxMinLen))) return { normIdx: pos, normLen: len };
            if (!bestFallback) bestFallback = { normIdx: pos, normLen: len };
          }
        }
        if (bestFallback) return bestFallback;
      }
      return null;
    }
    let localCursor = 0;
    for (const m of batch.markers) {
      const ep = m.exclusion_point;
      if (!ep) continue;
      const match = localFuzzyFind(ep, m.context_after, localCursor);
      if (match) {
        let localOrigStart = match.normIdx < localNormMap.length ? localNormMap[match.normIdx] : batch.text.length;
        // 向前倒退，吃掉左侧的常见开闭符号
        while (localOrigStart > 0 && /[【\[\(\<]/.test(batch.text[localOrigStart - 1])) {
          localOrigStart--;
        }
        // 从 localOrigStart 开始向后扫描，找到 exclusion_point 原文的完整结束位置（包含标点）
        let localOrigEnd = localOrigStart;
        if (ep) {
          const afterText = batch.text.substring(localOrigStart);
          const epIdx = afterText.indexOf(ep);
          if (epIdx !== -1) {
            localOrigEnd = localOrigStart + epIdx + ep.length - 1;
          } else {
            // 兜底：使用规范化匹配的位置
            const lastNormIdx = match.normIdx + match.normLen - 1;
            localOrigEnd = lastNormIdx < localNormMap.length ? localNormMap[lastNormIdx] : batch.text.length;
            // 向后推进，吃掉右侧的常见开闭符号
            while (localOrigEnd + 1 < batch.text.length && /[】\]\)\>]/.test(batch.text[localOrigEnd + 1])) {
              localOrigEnd++;
            }
          }
        }
        allMatches.push({ exclusion_point: ep, absOrigStart: batch.origStart + localOrigStart, absOrigEnd: batch.origStart + localOrigEnd });
        localCursor = match.normIdx + match.normLen;
      }
    }
  }
  allMatches.sort((a, b) => a.absOrigStart - b.absOrigStart);
  const deduped = [];
  for (const m of allMatches) {
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      if (Math.abs(m.absOrigStart - prev.absOrigStart) < 100) {
        prev.absOrigEnd = Math.max(prev.absOrigEnd, m.absOrigEnd);
        continue;
      }
    }
    deduped.push(m);
  }
  return deduped;
}

function splitByMarkers(dedupedPoints, fullText) {
  if (dedupedPoints.length === 0) return [{ startChar: 0, endChar: fullText.length, charCount: fullText.length, title: '' }];
  const starts = [];
  for (const pt of dedupedPoints) {
    let so = pt.absOrigEnd + 1;
    while (so < fullText.length && /[\s\n\r]/.test(fullText[so])) so++;
    starts.push({ textStart: so, markerStart: pt.absOrigStart, title: pt.exclusion_point });
  }
  const segments = [];
  for (let i = 0; i < starts.length; i++) {
    const startOrig = starts[i].textStart;
    const endOrig = i < dedupedPoints.length - 1 ? starts[i + 1].markerStart : fullText.length;
    if (endOrig <= startOrig) continue;
    segments.push({ startChar: startOrig, endChar: endOrig, charCount: endOrig - startOrig, title: starts[i].title });
  }
  return segments;
}

function splitLongSegment(fullText, startChar, endChar, limitValue) {
  const text = fullText.substring(startChar, endChar);
  const total = text.length;
  const parts = Math.ceil(total / limitValue);
  if (parts <= 1) return [{ startChar, endChar, charCount: total }];
  const targetLen = Math.ceil(total / parts);
  const result = [];
  let cur = 0;
  for (let p = 0; p < parts - 1; p++) {
    let cut = Math.min(cur + targetLen, total);
    let found = -1;
    for (let i = cut; i > Math.max(cur, cut - 500) && found === -1; i--) if (text[i] === '\n' && i > 0 && text[i - 1] === '\n') found = i + 1;
    if (found === -1) for (let i = cut; i > Math.max(cur, cut - 300) && found === -1; i--) if (text[i] === '\n') found = i + 1;
    if (found === -1) for (let i = cut; i > Math.max(cur, cut - 200) && found === -1; i--) if ('。！？'.includes(text[i])) found = i + 1;
    if (found !== -1) cut = found;
    result.push({ startChar: startChar + cur, endChar: startChar + cut, charCount: cut - cur });
    cur = cut;
  }
  result.push({ startChar: startChar + cur, endChar, charCount: total - cur });
  return result;
}

/** 并发执行（带上限） */
async function runPool(items, limit, worker) {
  const results = [];
  let index = 0;
  let active = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (index >= items.length && active === 0) return resolve(results);
      while (active < limit && index < items.length) {
        const i = index++;
        active++;
        Promise.resolve(worker(items[i], i)).then((r) => { results[i] = r; active--; next(); });
      }
    };
    next();
  });
}

/**
 * 主入口：对长文本进行模型分集
 * @param {{text:string, maxChars?:number, concurrent?:number}} args
 */
export async function segmentNovel({ text, maxChars, concurrent = 8 }) {
  const clean = preprocessText(text);
  if (clean.length < 50) return { episodes: [{ id: 1, title: '全文', text: clean }], markers: [], rawBatches: [] };

  const sysVer = await getActiveVersion('step1.system');
  const systemPrompt = sysVer.content;
  const meta = { model: await getNodeModel('step1'), prompts: [pickVer(sysVer)] };
  const batches = splitIntoBatches(clean, BATCH_SIZE, OVERLAP);

  // 提示词样例（供前端查看「最终发送的提示词」）
  const samplePrompt =
    `【System 提示词】\n${systemPrompt}\n\n` +
    `【User（批次1/${batches.length}）】\n以下是小说片段（批次1/${batches.length}）：\n\n` +
    `${(batches[0]?.text || '').slice(0, 3000)}${(batches[0]?.text || '').length > 3000 ? '\n…（批次内容已截断预览）' : ''}`;

  const rawResults = await runPool(batches, concurrent, async (batch) => {
    try {
      const { parsed } = await callLLM(
        `以下是小说片段（批次${batch.id + 1}/${batches.length}）：\n\n${batch.text}`,
        { system: systemPrompt, responseFormatJson: true, expectJson: true, temperature: 0.1, maxTokens: 4096, retries: 3, nodeKey: 'step1' }
      );
      const markers = parsed?.markers || (Array.isArray(parsed) ? parsed : []);
      return { id: batch.id, markers, origStart: batch.origStart, text: batch.text };
    } catch {
      return { id: batch.id, markers: [], origStart: batch.origStart, text: batch.text };
    }
  });

  const batchResults = rawResults.filter(Boolean).sort((a, b) => a.id - b.id);
  const deduped = deduplicateByBatch(batchResults);
  const rawSegments = splitByMarkers(deduped, clean);

  const limit = maxChars && maxChars > 0 ? maxChars : Infinity;
  const finalSegments = [];
  for (const seg of rawSegments) {
    if (seg.charCount > limit) {
      finalSegments.push(...splitLongSegment(clean, seg.startChar, seg.endChar, limit).map((s) => ({ ...s, title: seg.title })));
    } else {
      finalSegments.push(seg);
    }
  }

  const episodes = finalSegments.map((s, i) => ({
    id: i + 1,
    title: s.title ? `第${i + 1}集 · ${s.title}`.slice(0, 40) : `第${i + 1}集`,
    text: clean.substring(s.startChar, s.endChar).trim(),
    charCount: s.charCount,
  }));

  return { episodes, markers: deduped, batchCount: batches.length, samplePrompt, meta };
}

// ---- 兜底：直接解析已分集文本（JSON/分隔符/章节标记），不调用模型 ----
export function parseEpisodes(input) {
  const text = String(input || '').trim();
  if (!text) return [];
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json.map((item, i) => normalizeEpisode(item, i));
    if (json && Array.isArray(json.episodes)) return json.episodes.map((item, i) => normalizeEpisode(item, i));
  } catch { /* 非 JSON */ }
  const sepMatch = text.split(/\n\s*(?:={3,}|-{3,}\s*EP\s*-{3,}|#{3,})\s*\n/i);
  if (sepMatch.length > 1) return sepMatch.map((t, i) => ({ id: i + 1, title: `第${i + 1}集`, text: t.trim() })).filter((e) => e.text);
  return [{ id: 1, title: '全文', text }];
}

function normalizeEpisode(item, i) {
  if (typeof item === 'string') return { id: i + 1, title: `第${i + 1}集`, text: item.trim() };
  return { id: item.id ?? i + 1, title: item.title || `第${i + 1}集`, text: String(item.text || item.content || '').trim() };
}
