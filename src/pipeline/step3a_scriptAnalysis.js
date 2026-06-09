// ============================================================
// Step3a 剧本类型分析（新增）
// 一次性轻量调用：分析题材/受众/节奏 -> 输出创作策略，供下游自动选模版
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { pickVer } from './_shared.js';

const VALID_STRATEGIES = ['action_heavy', 'emotion_heavy', 'suspense', 'romance', 'balanced'];

/**
 * @param {{fullText:string, metaInfo?:object}} args
 */
export async function analyzeScript({ fullText, metaInfo }) {
  const sysVer = await getActiveVersion('step3a.system');
  // 文本过长时只取首尾采样，降低成本（分析不需要全文逐字）
  const sample = sampleText(fullText, 8000);
  const prompt = fillTemplate(sysVer.content, {
    meta_info: JSON.stringify(metaInfo || {}, null, 2),
    text_sample: sample,
  });
  const { content, parsed } = await callLLM(prompt, { expectJson: true, maxTokens: 2000, nodeKey: 'step3a' });
  const analysis = normalizeAnalysis(parsed);
  const meta = { model: await getNodeModel('step3a'), prompts: [pickVer(sysVer)] };
  return { payload: prompt, raw: content, parsed: analysis, meta };
}

function sampleText(text, budget) {
  const t = String(text || '');
  if (t.length <= budget) return t;
  const head = t.slice(0, Math.floor(budget * 0.6));
  const tail = t.slice(-Math.floor(budget * 0.4));
  return `${head}\n\n……（中段省略）……\n\n${tail}`;
}

function normalizeAnalysis(parsed) {
  const a = parsed || {};
  let strat = a.recommended_strategy;
  if (!VALID_STRATEGIES.includes(strat)) strat = 'balanced';
  return {
    genre: a.genre || '未知',
    audience: a.audience || '通用',
    pacing: a.pacing || '中速',
    visual_focus: a.visual_focus || '叙事均衡',
    emotion_style: a.emotion_style || '自然',
    recommended_strategy: strat,
    notes: a.notes || '',
  };
}
