// ============================================================
// 火山方舟 LLM 调用：OpenAI 兼容 chat/completions
// 沿用现有 HTML 工具逻辑，增强：超时 / 重试 / JSON 解析容错
// ============================================================
import { DEFAULT_LLM_SETTINGS } from '../config/llm.config.js';
import { readSettings } from './storage.js';

/** 去掉 baseUrl 末尾已知路径，再拼接目标 path（对齐现有工具 buildAPIUrl） */
function buildApiUrl(baseUrl, p) {
  const cleaned = (baseUrl || DEFAULT_LLM_SETTINGS.baseUrl)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/models\/?$/i, '');
  return `${cleaned}/${p.replace(/^\/+/, '')}`;
}

export async function getSettings() {
  return { ...DEFAULT_LLM_SETTINGS, ...(await readSettings(DEFAULT_LLM_SETTINGS)) };
}

/** 按节点解析使用的模型：节点覆盖 > 全局默认 */
export function resolveModel(settings, nodeKey) {
  if (nodeKey && settings.nodeModels && settings.nodeModels[nodeKey]) {
    return settings.nodeModels[nodeKey];
  }
  return settings.model || DEFAULT_LLM_SETTINGS.model;
}

/** 取某节点当前会使用的模型（用于项目档案记录） */
export async function getNodeModel(nodeKey) {
  return resolveModel(await getSettings(), nodeKey);
}

/** 获取可用模型列表（GET {baseUrl}/models，兼容 Ark items / OpenAI data） */
export async function fetchModels() {
  const settings = await getSettings();
  if (!settings.apiKey) throw Object.assign(new Error('未配置 API Key'), { status: 400 });
  const url = buildApiUrl(settings.baseUrl, 'models');
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${settings.apiKey}` } });
    if (!resp.ok) throw new Error(`获取模型失败 (${resp.status})`);
    const data = await resp.json();
    if (Array.isArray(data.data)) return data.data.map((m) => m.id).filter(Boolean);
    if (Array.isArray(data.items)) return data.items.map((m) => m.endpoint_id || m.model_id).filter(Boolean);
    return [];
  } catch (e) {
    if (e.name === 'TypeError' || e.message.includes('Failed to fetch')) {
      throw new Error('浏览器跨域限制，无法直接拉取模型列表，请手动填入模型或接入点ID。');
    }
    throw e;
  }
}

/** 从可能带 ```json 包裹或前后缀的文本中提取纯 JSON 并解析 */
export function parseJsonLoose(text) {
  if (text == null) return null;
  let t = String(text).trim();
  // 去掉 markdown 代码块围栏
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(t);
  } catch {
    // 退而求其次：截取第一个 { 或 [ 到最后一个 } 或 ]
    const firstObj = t.indexOf('{');
    const firstArr = t.indexOf('[');
    let start = -1;
    if (firstObj === -1) start = firstArr;
    else if (firstArr === -1) start = firstObj;
    else start = Math.min(firstObj, firstArr);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 调用 LLM（单条 user 消息）
 * @param {string} prompt 完整提示词
 * @param {import('../types.js')} [options]
 * @returns {Promise<{content:string, parsed:any|null}>}
 */
export async function callLLM(prompt, options = {}) {
  const settings = await getSettings();
  const apiKey = settings.apiKey;
  if (!apiKey) {
    const err = new Error('未配置 API Key，请先在设置中填写火山 API Key');
    err.status = 400;
    throw err;
  }

  const messages = [];
  if (options.system) messages.push({ role: 'system', content: options.system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: options.model || resolveModel(settings, options.nodeKey),
    max_tokens: options.maxTokens ?? settings.maxTokens ?? DEFAULT_LLM_SETTINGS.maxTokens,
    temperature: options.temperature ?? settings.temperature ?? DEFAULT_LLM_SETTINGS.temperature,
    messages,
  };
  if (options.responseFormatJson) body.response_format = { type: 'json_object' };

  const url = buildApiUrl(settings.baseUrl, 'chat/completions');
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 300000; // 5 分钟

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    
    const onAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      options.signal.addEventListener('abort', onAbort);
    }

    const attemptStart = Date.now();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const elapsed = Date.now() - attemptStart;
      if (elapsed > 10000) {
        console.log(`⏱️ LLM请求耗时: ${elapsed}ms | 节点: ${options.nodeKey || 'default'} | 尝试: ${attempt + 1}/${retries + 1}`);
      }
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`API 错误 (${resp.status}): ${errText}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content == null) throw new Error('API 返回格式异常（无 content）');

      const parsed = options.expectJson ? parseJsonLoose(content) : null;
      if (options.expectJson && parsed == null) {
        throw new Error('模型未返回合法 JSON');
      }
      return { content, parsed };
    } catch (e) {
      const elapsed = Date.now() - attemptStart;
      console.log(`❌ LLM请求失败: ${elapsed}ms | 节点: ${options.nodeKey || 'default'} | 尝试: ${attempt + 1}/${retries + 1} | ${e.message.slice(0, 100)}`);
      lastErr = e;
      if (attempt < retries && e.name !== 'AbortError') {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (e.name === 'AbortError') break; // DO NOT retry on abort
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr;
}

/** 占位符填充：{{key}} -> value（对齐现有工具 tpl） */
export function fillTemplate(template, vars) {
  let t = template;
  for (const [k, v] of Object.entries(vars)) {
    t = t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? '');
  }
  return t;
}
