const CACHE_PREFIX = 'upload_url_cache_v1';
const EXP_BUFFER_SEC = 300;

function cacheKey(userId) {
  return userId ? `${CACHE_PREFIX}:${userId}` : CACHE_PREFIX;
}

export function extractUploadPath(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  let pathPart = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathPart = new URL(raw).pathname;
    } catch {
      return null;
    }
  } else if (!raw.startsWith('/')) {
    pathPart = `/${raw.replace(/^\.\//, '')}`;
  }

  if (!pathPart.startsWith('/uploads/')) return null;
  const filename = pathPart.slice('/uploads/'.length).split('?')[0].split('/')[0];
  if (!filename || filename.includes('..')) return null;
  return `/uploads/${filename}`;
}

function parseExpFromUrl(url) {
  const raw = String(url || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  const m = /[?&]e=(\d+)/.exec(q);
  if (!m) return 0;
  const exp = Number(m[1]);
  return Number.isFinite(exp) ? exp : 0;
}

function loadMap(userId) {
  try {
    const raw = uni.getStorageSync(cacheKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(userId, map) {
  try {
    uni.setStorageSync(cacheKey(userId), JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * 优先复用仍有效的签名 URL，避免列表刷新后缩略图重复下载。
 */
export function resolveSignedUploadUrl(url, path, userId) {
  const stablePath = path || extractUploadPath(url);
  if (!stablePath) return url;

  const map = loadMap(userId);
  const now = Math.floor(Date.now() / 1000);
  const hit = map[stablePath];

  if (hit?.url && hit.exp > now + EXP_BUFFER_SEC) {
    return hit.url;
  }

  if (url) {
    const exp = parseExpFromUrl(url);
    if (exp > now) {
      map[stablePath] = { url, exp };
      saveMap(userId, map);
    }
    return url;
  }

  return hit?.url || url;
}

function applyToRecord(record, userId) {
  if (!record) return record;
  const next = { ...record };

  if (next.imageUrl) {
    next.imageUrl = resolveSignedUploadUrl(next.imageUrl, next.imageUrlPath, userId);
  }

  if (Array.isArray(next.imageUrls)) {
    const paths = Array.isArray(next.imagePaths) ? next.imagePaths : [];
    next.imageUrls = next.imageUrls.map((u, i) =>
      resolveSignedUploadUrl(u, paths[i] || extractUploadPath(u), userId)
    );
  }

  if (Array.isArray(next.imageMeta)) {
    next.imageMeta = next.imageMeta.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const path = m.path || extractUploadPath(m.url);
      return {
        ...m,
        path,
        url: m.url ? resolveSignedUploadUrl(m.url, path, userId) : m.url
      };
    });
  }

  return next;
}

export function applyImageUrlCacheToRecords(records, userId) {
  if (!Array.isArray(records)) return [];
  return records.map((r) => applyToRecord(r, userId));
}

export function clearImageUrlCache(userId) {
  if (!userId) return;
  try {
    uni.removeStorageSync(cacheKey(userId));
  } catch {
    // ignore
  }
}
