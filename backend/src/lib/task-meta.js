/**
 * 任务详情/重试用的轻量元数据（不依赖 AI / 配图流水线）。
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const MAX_IMAGE_REGEN_PER_SLOT = 3;

export function parseTaskImages(record) {
  let imageUrls = [];
  let imageMeta = [];
  try {
    imageUrls = record.imageUrls ? JSON.parse(record.imageUrls) : [];
  } catch {
    imageUrls = record.imageUrl ? [record.imageUrl] : [];
  }
  try {
    imageMeta = record.imageMeta ? JSON.parse(record.imageMeta) : [];
  } catch {
    imageMeta = [];
  }
  if (!Array.isArray(imageUrls)) imageUrls = [];
  if (!Array.isArray(imageMeta)) imageMeta = [];
  return {
    imageUrls: imageUrls.filter(Boolean),
    imageMeta: imageMeta.filter((m) => m?.url)
  };
}

/**
 * 判断重试策略：
 * - images：文案已有，配图不足/失败 → 只重试配图
 * - full：文案也没有 → 整单重提
 * - null：无需重试
 */
export function getRetryPlan(record) {
  if (!record) return null;
  if (record.status === TASK_STATUS.PENDING || record.status === TASK_STATUS.PROCESSING) {
    return null;
  }

  const output = String(record.output || '').trim();
  let imageCount = 0;
  let imageSource = 'ai';
  let productPhotos = null;
  try {
    const input = JSON.parse(record.input || '{}');
    imageCount = Math.min(5, Math.max(0, Number(input.imageCount) || 0));
    imageSource = input.imageSource || 'ai';
    productPhotos = Array.isArray(input.productPhotos) ? input.productPhotos : null;
  } catch {
    /* ignore */
  }

  const { imageUrls } = parseTaskImages(record);
  const needsImages =
    imageCount > 0 || imageSource === 'product' || Boolean(productPhotos?.length);
  const expected =
    imageSource === 'product' || productPhotos?.length
      ? Math.max(imageCount, productPhotos?.length || 0, 1)
      : imageCount;
  const missingImages = needsImages && imageUrls.length < expected;
  const imageFailNote = /配图失败|文案已完成|配图完成|服务繁忙/.test(String(record.error || ''));

  if (output && needsImages && (missingImages || imageFailNote)) {
    return {
      mode: 'images',
      label: '重试配图',
      done: imageUrls.length,
      expected
    };
  }

  if (!output && (record.status === TASK_STATUS.FAILED || imageFailNote)) {
    return { mode: 'full', label: '重新提交' };
  }

  if (record.status === TASK_STATUS.FAILED && !output) {
    return { mode: 'full', label: '重新提交' };
  }

  return null;
}

export function getImageRegenCount(metaItem) {
  return Math.min(
    MAX_IMAGE_REGEN_PER_SLOT,
    Math.max(0, Math.floor(Number(metaItem?.regenCount) || 0))
  );
}

export function getImageRegenRemaining(metaItem) {
  return Math.max(0, MAX_IMAGE_REGEN_PER_SLOT - getImageRegenCount(metaItem));
}

export function buildImageRegenInfo(imageMeta = [], imageUrls = []) {
  const len = Math.max(
    Array.isArray(imageMeta) ? imageMeta.length : 0,
    Array.isArray(imageUrls) ? imageUrls.length : 0
  );
  const used = [];
  const remaining = [];
  for (let i = 0; i < len; i += 1) {
    const m = (Array.isArray(imageMeta) && imageMeta[i]) || {};
    used.push(getImageRegenCount(m));
    remaining.push(getImageRegenRemaining(m));
  }
  return { max: MAX_IMAGE_REGEN_PER_SLOT, used, remaining };
}
