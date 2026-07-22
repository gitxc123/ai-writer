const IMAGE_ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations';
const DEFAULT_MODEL = 'agnes-image-2.1-flash';

const SIZE_OPTIONS = {
  square: '1024x1024',
  landscape: '1024x768',
  portrait: '768x1024',
  cover: '1024x576'
};

function getApiKey() {
  const key = process.env.AI_API_KEY || process.env.AGNES_API_KEY;
  if (!key) throw new Error('请配置 Agnes API Key（AI_API_KEY）');
  return key;
}

const IMAGE_VARIANTS = [
  'hero cover illustration, wide composition',
  'detail scene illustration, close-up focus',
  'lifestyle scene, natural environment',
  'concept highlight, creative visual metaphor',
  'summary visual, clean minimalist layout'
];

/** AI 生图：凡出现人物，统一东亚/亚洲人外貌 */
export const ASIAN_PEOPLE_CONSTRAINT =
  'If any person appears in the image, all people must be East Asian / Asian appearance (东亚亚洲人脸与气质); do not depict Caucasian or Western facial features for human subjects';

export function applyAsianPeopleConstraint(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return p;
  if (p.includes(ASIAN_PEOPLE_CONSTRAINT) || /all people must be East Asian/i.test(p)) {
    return p;
  }
  return `${p}. ${ASIAN_PEOPLE_CONSTRAINT}`;
}

export function buildImagePrompt({ keyword, style, templateName }) {
  const topic = keyword || templateName || 'creative content';
  const mood = style || 'modern and clean';
  return applyAsianPeopleConstraint(
    `A high-quality social media illustration about "${topic}", ${mood} style, vibrant colors, professional composition, suitable for article cover, no text overlay, detailed and eye-catching`
  );
}

export function buildImagePromptVariant({ keyword, style, templateName, output, index, total, scenePrompt }) {
  if (scenePrompt) {
    return applyAsianPeopleConstraint(
      `${scenePrompt}. High quality, professional composition, suitable for social media article illustration, no text overlay, image ${index + 1} of ${total}`
    );
  }
  const base = buildImagePrompt({ keyword, style, templateName });
  const variant = IMAGE_VARIANTS[index % IMAGE_VARIANTS.length];
  const snippet = output ? output.replace(/\s+/g, ' ').slice(0, 200) : '';
  const context = snippet ? `, must visually represent this article section: "${snippet}"` : '';
  return applyAsianPeopleConstraint(
    `${base}, ${variant}${context}, image ${index + 1} of ${total}, unique angle, content-accurate`
  );
}

export function buildImagePayload({ prompt, size = '1024x768', model, images }) {
  const extra_body = { response_format: 'url' };
  if (Array.isArray(images) && images.length) {
    extra_body.image = images;
  }
  const resolvedModel = images?.length
    ? (model || 'agnes-image-2.1-flash')
    : (model || DEFAULT_MODEL);
  return {
    model: resolvedModel,
    prompt: applyAsianPeopleConstraint(prompt),
    size: SIZE_OPTIONS[size] || size,
    extra_body
  };
}

function isRetryableImageError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('queue is full') ||
    msg.includes('retry later') ||
    msg.includes('rate limit') ||
    msg.includes('too many') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('429') ||
    msg.includes('service busy') ||
    msg.includes('service unavailable') ||
    msg.includes('server busy') ||
    msg.includes('overloaded') ||
    msg.includes('invalid argument returned 22') ||
    msg.includes('comfyui')
  );
}

/**
 * 文生图；对 503/繁忙等可重试错误自动退避重试。
 */
export async function generateImage({
  prompt,
  size = '1024x768',
  model,
  images,
  retries = 3
}) {
  const payload = buildImagePayload({ prompt, size, model, images });
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(360000)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.detail ||
          data?.message ||
          `HTTP ${res.status}`;
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.status = res.status;
        throw err;
      }

      const url = data?.data?.[0]?.url;
      if (!url) {
        throw new Error('Agnes 未返回图片 URL');
      }
      return url;
    } catch (err) {
      lastErr = err;
      if (!isRetryableImageError(err) || attempt === retries) break;
      const msg = String(err.message || '');
      const queueBusy = /queue is full|retry later|rate limit|429|too many|service busy|503|unavailable/i.test(
        msg
      );
      const waitMs = queueBusy
        ? Math.min(45000, 6000 * 2 ** attempt)
        : Math.min(20000, 3000 * 2 ** attempt);
      console.warn(
        `[agnes-image] text2img retry ${attempt + 1}/${retries} after ${waitMs}ms:`,
        err.message
      );
      await sleep(waitMs);
    }
  }

  throw lastErr || new Error('配图失败');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateImageFromRefs({
  prompt,
  images,
  size = 'square',
  model,
  retries = 3,
  refreshImages
}) {
  if (!images?.length) throw new Error('缺少参考图');

  let lastErr;
  let refs = images;
  let refreshed = false;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // 2.1 更偏构图/主体保留；产品保真优先用它
      return await generateImage({
        prompt,
        size,
        images: refs,
        model: model || 'agnes-image-2.1-flash',
        retries: 0
      });
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableImageError(err);
      const msg = String(err.message || '');
      // 多参考图失败时，降级成只用第一张再试
      if (refs.length > 1 && /invalid argument/i.test(msg)) {
        console.warn('[agnes-image] multi-ref failed, fallback to primary ref');
        refs = [images[0]];
      } else if (!refreshed && typeof refreshImages === 'function' && /invalid argument|comfyui/i.test(msg)) {
        try {
          const next = await refreshImages(refs);
          if (Array.isArray(next) && next.length) {
            refs = next;
            refreshed = true;
            console.warn('[agnes-image] refreshed image host after Comfy error');
          }
        } catch (e) {
          console.warn('[agnes-image] refreshImages failed', e.message);
        }
      }
      if (!retryable || attempt === retries) break;
      const queueBusy = /queue is full|retry later|rate limit|429|too many/i.test(msg);
      // 队列满时多等一会儿，比立刻连打更容易成功
      const waitMs = queueBusy
        ? Math.min(45000, 6000 * 2 ** attempt)
        : Math.min(20000, 3000 * 2 ** attempt);
      console.warn(
        `[agnes-image] retry ${attempt + 1}/${retries} after ${waitMs}ms:`,
        err.message
      );
      await sleep(waitMs);
    }
  }

  throw lastErr || new Error('配图失败');
}

import { toUserErrorMessage } from './user-error.js';

export function formatImageError(err) {
  const msg = err?.message || '未知错误';
  if (/请配置|未配置/.test(msg)) return '服务未配置完成，请联系管理员';
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
    return '服务授权失败，请联系管理员';
  }
  if (/timeout|aborted|超时/i.test(msg)) {
    return '配图生成超时，请稍后重试';
  }
  if (/503|busy|unavailable/i.test(msg)) {
    return '高峰期服务繁忙，配图可能失败，请稍后再试';
  }
  return toUserErrorMessage(err, '配图生成失败，请稍后重试');
}
