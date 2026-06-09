// ============================================================
// Step3b-1 原文拆分：程序分段 + 模型输出 id/loc/ct（无 shots）
// 支持单 chunk 拆分（并发）+ 整集拆分（兼容）
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { assetBlocks, pickVer } from './_shared.js';
import { segmentTextByChars } from '../utils/textSegment.js';
import { validateSplitUnits } from '../validators/splitValidator.js';
import { runPool } from '../utils/runPool.js';

/** 剥离模型可能多输出的字段，拆分步只保留 id/loc/ct */
export function sanitizeSplitUnits(units) {
  return (units || []).map((u, idx) => ({
    id: u.id ?? idx + 1,
    loc: u.loc ? { n: u.loc.n || '', v: u.loc.v || '' } : { n: '', v: '' },
    ct: String(u.ct || ''),
  }));
}

/**
 * 对单段文本调用模型拆分
 */
export async function splitChunk(args) {
  const {
    mode,
    chunkText,
    chunkIndex,
    startId,
    scenes,
    creativeOverride,
    analysis,
    signal,
  } = args;

  const systemKey = mode === 'script' ? 'step3b-split.system.script' : 'step3b-split.system.narration';
  const creativeKey = mode === 'script' ? 'step3b-split.creative.script' : 'step3b-split.creative.narration';

  const sysVer = await getActiveVersion(systemKey);
  const creVer = await getActiveVersion(creativeKey);
  const usingOverride = !!(creativeOverride && creativeOverride.trim());
  const creative = usingOverride ? creativeOverride : creVer.content;

  const blocks = assetBlocks({ scenes: scenes || [] });
  const prompt = fillTemplate(sysVer.content, {
    creative_block: creative,
    analysis: JSON.stringify(analysis || {}, null, 2),
    strategy: analysis?.recommended_strategy || 'balanced',
    scenes: blocks.scenes,
    target_text: chunkText,
    chunk_index: String(chunkIndex + 1),
    start_id: String(startId),
  });

  const nodeKey = mode === 'script' ? 'step3b-split-script' : 'step3b-split-narration';
  const { content, parsed } = await callLLM(prompt, { expectJson: true, nodeKey, signal });
  const meta = {
    model: await getNodeModel(nodeKey),
    prompts: [pickVer(sysVer), pickVer(creVer, usingOverride ? '前端覆盖' : null)],
  };
  const rawUnits = parsed?.units || parsed?.storys || [];
  const units = sanitizeSplitUnits(rawUnits);
  return { payload: prompt, raw: content, units, meta };
}

/**
 * 单 chunk 拆分 + 校验 + 重试（供前端并发与流水线镜头创作）
 */
export async function splitSingleChunk(args) {
  const {
    mode = 'narration',
    chunkText,
    chunkIndex = 0,
    scenes,
    maxRetries = 2,
    analysis,
    creativeOverride,
    signal,
  } = args;

  const maxAttempts = Math.max(1, (maxRetries ?? 2) + 1);
  const allPayloads = [];
  let lastMeta;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const r = await splitChunk({
      mode,
      chunkText,
      chunkIndex,
      startId: 1,
      scenes,
      creativeOverride,
      analysis,
      signal,
    });
    allPayloads.push({ label: `分段${chunkIndex + 1}·尝试${attempt}`, text: r.payload });
    lastMeta = r.meta;

    const validation = validateSplitUnits({ units: r.units }, chunkText, mode);
    if (validation.pass || attempt >= maxAttempts) {
      return {
        units: r.units,
        validation,
        payloads: allPayloads,
        meta: lastMeta,
        attempts: attempt,
        forced: !validation.pass && attempt >= maxAttempts,
        chunkIndex,
      };
    }
  }

  return {
    units: [],
    validation: { pass: false, issues: [] },
    payloads: allPayloads,
    meta: lastMeta,
    attempts: attempt,
    chunkIndex,
  };
}

/**
 * 拆分单集原文（整集接口，chunk 可并发）
 */
export async function splitEpisodeScriptText(args) {
  const {
    episodeText,
    creativeOverride,
    analysis,
    signal,
  } = args;

  const clean = String(episodeText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (clean.length < 20) {
    return {
      units: [{ id: 1, ct: clean }],
      validation: { pass: true, issues: [] },
      payloads: [],
      meta: { model: '（无）', prompts: [] }
    };
  }

  const systemKey = 'step3b-split.system.script';
  const sysVer = await getActiveVersion(systemKey);

  const BATCH_SIZE = 10000;
  const OVERLAP = 200;
  const batches = [];
  let pos = 0;
  let prevCutEnd = 0;
  while (pos < clean.length) {
    let end = pos + BATCH_SIZE;
    if (end < clean.length) {
      let cutAt = end;
      for (let i = end; i > Math.max(pos + Math.floor(BATCH_SIZE / 2), end - 500); i--) {
        if (clean[i] === '\n') { cutAt = i + 1; break; }
      }
      end = cutAt;
    } else {
      end = clean.length;
    }
    const batchStart = batches.length === 0 ? 0 : Math.max(0, prevCutEnd - OVERLAP);
    batches.push({ id: batches.length, text: clean.substring(batchStart, end), origStart: batchStart, origEnd: end });
    prevCutEnd = end;
    pos = end;
  }

  const systemPrompt = fillTemplate(sysVer.content, {
    analysis: JSON.stringify(analysis || {}, null, 2),
    strategy: analysis?.recommended_strategy || 'balanced',
    scenes: '',
    target_text: clean,
    chunk_index: '1',
    start_id: '1',
  });

  const allPayloads = [];
  const rawResults = new Array(batches.length);
  await runPool(batches, 4, async (batch) => {
    try {
      const userContent = `以下是剧本片段（批次${batch.id + 1}/${batches.length}）：\n\n${batch.text}`;
      const { content, parsed } = await callLLM(
        userContent,
        { system: systemPrompt, responseFormatJson: true, expectJson: true, temperature: 0.1, maxTokens: 4096, retries: 3, nodeKey: 'step3b-split-script', signal }
      );
      allPayloads.push({
        label: `场次拆分·批次${batch.id + 1}`,
        text: `【System 提示词】\n${systemPrompt}\n\n【User】\n${userContent}\n\n【Model Output】\n${content}`
      });
      const markers = parsed?.markers || (Array.isArray(parsed) ? parsed : []);
      rawResults[batch.id] = { id: batch.id, markers, origStart: batch.origStart, text: batch.text };
    } catch (e) {
      console.error('LLM split script batch error:', e);
      rawResults[batch.id] = { id: batch.id, markers: [], origStart: batch.origStart, text: batch.text };
    }
  });

  const batchResults = rawResults.filter(Boolean).sort((a, b) => a.id - b.id);
  
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
        // Adjust backward to include opening brackets
        while (localOrigStart > 0 && /[【\[\(\<]/.test(batch.text[localOrigStart - 1])) {
          localOrigStart--;
        }
        let localOrigEnd = localOrigStart;
        if (ep) {
          const afterText = batch.text.substring(localOrigStart);
          const epIdx = afterText.indexOf(ep);
          if (epIdx !== -1) {
            localOrigEnd = localOrigStart + epIdx + ep.length - 1;
          } else {
            const lastNormIdx = match.normIdx + match.normLen - 1;
            localOrigEnd = lastNormIdx < localNormMap.length ? localNormMap[lastNormIdx] : batch.text.length;
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
      if (Math.abs(m.absOrigStart - prev.absOrigStart) < 20) {
        prev.absOrigEnd = Math.max(prev.absOrigEnd, m.absOrigEnd);
        continue;
      }
    }
    deduped.push(m);
  }

  const rawSegments = splitScriptByMarkers(deduped, clean);

  const validSegments = rawSegments.filter(s => {
    const text = clean.substring(s.startChar, s.endChar).trim();
    return text.length > 0 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(text);
  });

  const units = validSegments.map((s, i) => ({
    id: i + 1,
    ct: clean.substring(s.startChar, s.endChar).trim()
  }));

  if (units.length === 0) {
    units.push({ id: 1, ct: clean });
  }

  const meta = {
    model: await getNodeModel('step3b-split-script'),
    prompts: [pickVer(sysVer)],
  };

  return {
    units,
    validation: { pass: true, issues: [] },
    payloads: allPayloads,
    meta,
    chunkCount: 1,
    forced: false,
  };
}

function splitScriptByMarkers(dedupedPoints, fullText) {
  if (dedupedPoints.length === 0) return [{ startChar: 0, endChar: fullText.length, charCount: fullText.length, title: '' }];
  const starts = [];
  
  const firstMarkerStart = dedupedPoints[0].absOrigStart;
  if (firstMarkerStart > 0 && fullText.substring(0, firstMarkerStart).trim().length > 0) {
    starts.push({ textStart: 0, markerStart: 0, title: '开始' });
  }
  
  for (const pt of dedupedPoints) {
    starts.push({ textStart: pt.absOrigStart, markerStart: pt.absOrigStart, title: pt.exclusion_point });
  }
  
  const segments = [];
  for (let i = 0; i < starts.length; i++) {
    const startOrig = starts[i].textStart;
    const endOrig = i < starts.length - 1 ? starts[i + 1].markerStart : fullText.length;
    if (endOrig <= startOrig) continue;
    segments.push({ startChar: startOrig, endChar: endOrig, charCount: endOrig - startOrig, title: starts[i].title });
  }
  return segments;
}

export async function splitEpisodeText(args) {
  const {
    mode = 'narration',
    episodeText,
    scenes,
    maxUnitChars = 500,
    maxRetries = 2,
    concurrency = 1,
    analysis,
    creativeOverride,
    signal,
  } = args;

  if (mode === 'script') {
    return splitEpisodeScriptText(args);
  }

  const chunks = segmentTextByChars(episodeText, maxUnitChars);
  const allPayloads = [];
  let lastMeta;
  const chunkResults = new Array(chunks.length);

  await runPool(
    chunks.map((text, ci) => ({ text, ci })),
    concurrency,
    async ({ text, ci }) => {
      const r = await splitSingleChunk({
        mode,
        chunkText: text,
        chunkIndex: ci,
        scenes,
        maxRetries,
        analysis,
        creativeOverride,
        signal,
      });
      chunkResults[ci] = r;
      allPayloads.push(...(r.payloads || []));
      lastMeta = r.meta;
    }
  );

  const mergedUnits = [];
  let nextId = 1;
  for (let ci = 0; ci < chunks.length; ci++) {
    for (const u of chunkResults[ci]?.units || []) {
      mergedUnits.push({ ...u, id: nextId++ });
    }
  }

  const validation = validateSplitUnits({ units: mergedUnits }, episodeText, mode);
  const anyForced = chunkResults.some((r) => r?.forced);

  return {
    units: mergedUnits,
    validation,
    payloads: allPayloads,
    meta: lastMeta,
    chunkCount: chunks.length,
    forced: anyForced || (!validation.pass && mergedUnits.length > 0),
  };
}

/** 程序分段（供前端流水线使用） */
export function segmentEpisodeText(episodeText, maxUnitChars) {
  return segmentTextByChars(episodeText, maxUnitChars);
}
