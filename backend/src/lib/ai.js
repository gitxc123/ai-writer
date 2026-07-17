import OpenAI from 'openai';

const PROVIDERS = {
  mock: {
    baseURL: '',
    model: '',
    needsKey: false
  },
  agnes: {
    baseURL: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-2.0-flash',
    needsKey: true
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:3b',
    needsKey: false,
    apiKey: 'ollama'
  },
  api: {
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true
  }
};

function getMode() {
  const mode = (process.env.AI_MODE || 'mock').toLowerCase();
  return PROVIDERS[mode] ? mode : 'mock';
}

export { getMode };

function getProvider(mode = getMode()) {
  return PROVIDERS[mode] || PROVIDERS.mock;
}

function normalizeBaseURL(url) {
  if (!url) return '';
  return url.endsWith('/v1') ? url : `${url.replace(/\/$/, '')}/v1`;
}

/**
 * Resolve connection for a specific provider mode.
 * Primary mode may use AI_* / AI_BASE_URL / AI_MODEL;
 * fallback (typically DeepSeek) uses AI_FALLBACK_* / DEEPSEEK_*.
 */
export function resolveProviderConfig(mode, { asFallback = false } = {}) {
  const provider = getProvider(mode);
  if (mode === 'mock') {
    return { mode, baseURL: '', model: '', apiKey: '', needsKey: false };
  }

  if (asFallback) {
    const baseURL = normalizeBaseURL(
      process.env.AI_FALLBACK_BASE_URL ||
        process.env.DEEPSEEK_BASE_URL ||
        provider.baseURL
    );
    const model =
      process.env.AI_FALLBACK_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      provider.model ||
      'deepseek-chat';
    const apiKey =
      process.env.AI_FALLBACK_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      provider.apiKey ||
      '';
    return { mode, baseURL, model, apiKey, needsKey: Boolean(provider.needsKey) };
  }

  const baseURL = normalizeBaseURL(
    process.env.AI_BASE_URL || provider.baseURL
  );
  const model = process.env.AI_MODEL || provider.model || 'deepseek-chat';
  const apiKey =
    process.env.AI_API_KEY || provider.apiKey || '';
  return { mode, baseURL, model, apiKey, needsKey: Boolean(provider.needsKey) };
}

function getBaseURL() {
  return resolveProviderConfig(getMode()).baseURL;
}

function getModel() {
  return resolveProviderConfig(getMode()).model;
}

export { getModel };

function getApiKey() {
  return resolveProviderConfig(getMode()).apiKey;
}

/**
 * Fallback chain. Default when primary is agnes: DeepSeek (`api`).
 * Set AI_FALLBACK_MODE=off to disable. Comma-separated for multiple.
 */
export function getFallbackModes(primaryMode = getMode()) {
  const raw = process.env.AI_FALLBACK_MODE;
  if (raw !== undefined) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed === 'off' || trimmed === 'none' || trimmed === 'false') {
      return [];
    }
    return trimmed
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m && m !== primaryMode && PROVIDERS[m] && m !== 'mock');
  }

  if (primaryMode === 'agnes') return ['api'];
  return [];
}

export function createAIClient(mode = getMode(), { asFallback = false } = {}) {
  const cfg = resolveProviderConfig(mode, { asFallback });
  return new OpenAI({
    apiKey: cfg.apiKey || 'unused',
    baseURL: cfg.baseURL
  });
}

export function isRetryableAIError(err) {
  const status = err?.status || err?.response?.status;
  const msg = String(err?.error?.message || err?.message || '').toLowerCase();
  const code = String(err?.code || err?.cause?.code || '').toLowerCase();

  if ([408, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  if ([401, 402, 403].includes(Number(status))) return true;
  if (
    /connection|fetch failed|timeout|etimedout|econnrefused|econnreset|enotfound|socket|network|aborted|und_err/.test(
      msg
    )
  ) {
    return true;
  }
  if (['etimedout', 'econnrefused', 'econnreset', 'enotfound', 'eai_again'].includes(code)) {
    return true;
  }
  return false;
}

export async function chatCompletions(request, requestOptions = {}, options = {}) {
  const primary = getMode();
  if (primary === 'mock') {
    throw new Error('mock mode has no real completions');
  }

  const fallbacks = getFallbackModes(primary)
    .map((mode) => ({ mode, asFallback: true }))
    .filter(({ mode, asFallback }) => {
      const cfg = resolveProviderConfig(mode, { asFallback });
      if (cfg.needsKey && !cfg.apiKey) {
        console.warn(
          `[ai] fallback ${mode} skipped: missing AI_FALLBACK_API_KEY or DEEPSEEK_API_KEY`
        );
        return false;
      }
      return true;
    });

  const chain = [{ mode: primary, asFallback: false }, ...fallbacks];

  let lastError;
  for (let i = 0; i < chain.length; i++) {
    const { mode, asFallback } = chain[i];
    const cfg = resolveProviderConfig(mode, { asFallback });

    if (cfg.needsKey && !cfg.apiKey) {
      lastError = new Error('missing API key');
      console.warn(`[ai] skip ${mode}: ${lastError.message}`);
      continue;
    }

    try {
      const client = createAIClient(mode, { asFallback });
      const response = await client.chat.completions.create(
        {
          ...request,
          model: request.model || cfg.model
        },
        requestOptions
      );
      if (asFallback || i > 0) {
        console.warn(`[ai] using fallback provider: ${mode} (${cfg.model})`);
      }
      if (options.onSuccess) options.onSuccess({ mode, model: cfg.model, asFallback });
      return response;
    } catch (err) {
      lastError = err;
      const hasNext = i < chain.length - 1;
      const retryable = isRetryableAIError(err);
      console.warn(
        `[ai] ${mode} failed${hasNext && retryable ? ', trying fallback' : ''}:`,
        err?.message || err
      );
      if (!hasNext || !retryable) throw err;
    }
  }

  throw lastError || new Error('AI call failed');
}

export function fillPrompt(template, inputs) {
  let prompt = String(template ?? '');
  for (const [key, value] of Object.entries(inputs || {})) {
    // 用 split/join，避免用户文案里的 $ 被 replace 当成特殊替换符
    const token = `{{${key}}}`;
    if (!prompt.includes(token)) continue;
    prompt = prompt.split(token).join(String(value ?? ''));
  }
  return prompt;
}

function mockGenerate(prompt) {
  const topic = prompt.match(/「([^」]+)」|主题[：:]\s*([^\s，。]+)|关键词[：:]\s*([^\s，。]+)/);
  const subject = topic?.[1] || topic?.[2] || topic?.[3] || '热门话题';

  return `【标题】${subject}｜一文读懂核心要点

【正文】
最近很多人都在关注「${subject}」。这篇文章帮你快速理清思路，适合直接发布到自媒体平台。

1. 开篇亮点：用真实场景引出话题，让读者有代入感。
2. 核心观点：围绕「${subject}」给出 2-3 个实用建议，避免空话。
3. 结尾引导：鼓励读者点赞、收藏、关注，提升互动率。

【话题标签】#${subject} #干货分享 #创作灵感

---
（演示模式：未连接真实 AI。可设置 AI_MODE=agnes 使用 Agnes AI）`;
}

import { toUserErrorMessage } from './user-error.js';

export function formatAIError(err) {
  const status = err?.status || err?.response?.status;
  const msg = err?.error?.message || err?.message || '未知错误';
  const mode = getMode();

  if (mode === 'mock') {
    return '演示模式异常，请稍后重试';
  }
  if (String(msg).includes('fallback') && String(msg).includes('missing API key')) {
    return '服务暂不可用，请稍后重试';
  }
  if (mode === 'agnes') {
    if (status === 401) return '服务授权失败，请联系管理员';
    if (/Connection|fetch failed/i.test(msg)) {
      return '无法连接创作服务，请检查网络后重试';
    }
  }
  if (mode === 'ollama') {
    if (/Connection|ECONNREFUSED|fetch failed/i.test(msg)) {
      return '本地模型未启动，请稍后重试或联系管理员';
    }
  }
  if (getProvider().needsKey && !getApiKey()) {
    return '服务未配置完成，请联系管理员';
  }
  if (status === 401) return '服务授权失败，请联系管理员';
  if (status === 402) return '服务额度不足，请稍后再试';
  if (status === 429) return '请求过于频繁，请稍后再试';
  if (status === 503 || /ServiceUnavailable|Service busy|busy/i.test(msg)) {
    return '高峰期服务繁忙，生成可能失败，请稍后再试';
  }
  if (/Connection|ENOTFOUND|fetch failed/i.test(msg)) {
    return '网络连接失败，请检查网络后重试';
  }
  if (/timeout|超时/i.test(msg)) {
    return '处理超时，请稍后重试';
  }
  return toUserErrorMessage(err, '生成失败，请稍后重试');
}

import { isNewsArticle, buildNewsSystemPrompt, buildNewsUserAddon } from './news-guard.js';
import { researchNewsHotspots, formatHotspotsForPrompt } from './news-research.js';

export async function generateText(prompt, options = {}) {
  const mode = getMode();
  const newsMode = options.newsMode === true || isNewsArticle(options);

  if (mode === 'mock') {
    await new Promise((r) => setTimeout(r, 800));
    return mockGenerate(prompt);
  }

  let researchText = '';
  if (newsMode) {
    try {
      const research = await researchNewsHotspots(options.keyword || prompt.slice(0, 80), { limit: 8 });
      researchText = formatHotspotsForPrompt(research);
      options._newsResearchCount = research.items?.length || 0;
    } catch (err) {
      console.warn('[generateText:news-research]', err.message);
      researchText = '\n【联网检索失败】请围绕用户主题写已知要点与观点，不要编造未核实细节。';
    }
  }

  const systemPrompt = options.systemPrompt
    ? options.systemPrompt
    : newsMode
      ? buildNewsSystemPrompt()
      : '你是专业的中文文案写作助手，输出简洁、有吸引力、符合平台风格的内容。';

  const userPrompt = newsMode
    ? `${prompt}${buildNewsUserAddon({
        keyword: options.keyword,
        style: options.style,
        researchText
      })}`
    : prompt;

  const response = await chatCompletions(
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature:
        typeof options.temperature === 'number'
          ? options.temperature
          : newsMode
            ? 0.35
            : 0.8
    },
    { timeout: options.timeout || 180000 }
  );
  return response.choices[0]?.message?.content || '';
}

/**
 * 多模态对话：文本 + 若干图片 URL（Agnes / OpenAI 兼容）
 */
export async function chatWithImages({
  system,
  text,
  imageUrls = [],
  temperature = 0.2,
  timeout = 180000
} = {}) {
  const mode = getMode();
  if (mode === 'mock') {
    return JSON.stringify({ mock: true, text: String(text || '').slice(0, 200) });
  }

  const content = [{ type: 'text', text: String(text || '') }];
  for (const url of imageUrls.filter(Boolean).slice(0, 9)) {
    content.push({ type: 'image_url', image_url: { url } });
  }

  const response = await chatCompletions(
    {
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content }
      ],
      temperature
    },
    { timeout }
  );
  return response.choices[0]?.message?.content || '';
}

/** 从模型回复中抠出第一个 JSON 对象/数组 */
export function extractJsonBlock(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('空响应');
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  const startObj = text.indexOf('{');
  const startArr = text.indexOf('[');
  const start =
    startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
  if (start === -1) throw new Error('未找到 JSON');
  const opener = text[start];
  const closer = opener === '[' ? ']' : '}';
  const end = text.lastIndexOf(closer);
  if (end <= start) throw new Error('JSON 不完整');
  return JSON.parse(text.slice(start, end + 1));
}
