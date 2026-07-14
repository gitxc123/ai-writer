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

export function buildImagePrompt({ keyword, style, templateName }) {
  const topic = keyword || templateName || 'creative content';
  const mood = style || 'modern and clean';
  return `A high-quality social media illustration about "${topic}", ${mood} style, vibrant colors, professional composition, suitable for article cover, no text overlay, detailed and eye-catching`;
}

export function buildImagePromptVariant({ keyword, style, templateName, output, index, total, scenePrompt }) {
  if (scenePrompt) {
    return `${scenePrompt}. High quality, professional composition, suitable for social media article illustration, no text overlay, image ${index + 1} of ${total}`;
  }
  const base = buildImagePrompt({ keyword, style, templateName });
  const variant = IMAGE_VARIANTS[index % IMAGE_VARIANTS.length];
  const snippet = output ? output.replace(/\s+/g, ' ').slice(0, 200) : '';
  const context = snippet ? `, must visually represent this article section: "${snippet}"` : '';
  return `${base}, ${variant}${context}, image ${index + 1} of ${total}, unique angle, content-accurate`;
}

export function buildImagePayload({ prompt, size = '1024x768', model, images }) {
  const extra_body = { response_format: 'url' };
  if (Array.isArray(images) && images.length) {
    extra_body.image = images;
  }
  const resolvedModel = images?.length
    ? (model || 'agnes-image-2.0-flash')
    : (model || DEFAULT_MODEL);
  return {
    model: resolvedModel,
    prompt,
    size: SIZE_OPTIONS[size] || size,
    extra_body
  };
}

export async function generateImage({
  prompt,
  size = '1024x768',
  model,
  images
}) {
  const payload = buildImagePayload({ prompt, size, model, images });

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
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const url = data?.data?.[0]?.url;
  if (!url) {
    throw new Error('Agnes 未返回图片 URL');
  }
  return url;
}

export async function generateImageFromRefs({ prompt, images, size = 'square' }) {
  if (!images?.length) throw new Error('缺少参考图');
  return generateImage({
    prompt,
    size,
    images,
    model: 'agnes-image-2.0-flash'
  });
}

export function formatImageError(err) {
  const msg = err?.message || '未知错误';
  if (msg.includes('请配置')) return msg;
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
    return 'Agnes API Key 无效';
  }
  if (msg.includes('timeout') || msg.includes('aborted')) {
    return '配图生成超时，请稍后重试';
  }
  return `配图失败：${msg}`;
}
