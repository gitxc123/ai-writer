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
 * 在已加载的 map 上解析签名 URL（单次读写由 apply 层控制）。
 */
function resolveWithMap(url, path, map, now) {
  const stablePath = path || extractUploadPath(url);
  if (!stablePath) return { url, dirty: false };

  const hit = map[stablePath];
  if (hit?.url && hit.exp > now + EXP_BUFFER_SEC) {
    return { url: hit.url, dirty: false };
  }

  if (url) {
    const exp = parseExpFromUrl(url);
    if (exp > now) {
      map[stablePath] = { url, exp };
      return { url, dirty: true };
    }
    return { url, dirty: false };
  }

  return { url: hit?.url || url, dirty: false };
}

/**
 * 优先复用仍有效的签名 URL，避免列表刷新后缩略图重复下载。
 */
export function resolveSignedUploadUrl(url, path, userId) {
  const map = loadMap(userId);
  const now = Math.floor(Date.now() / 1000);
  const { url: next, dirty } = resolveWithMap(url, path, map, now);
  if (dirty) saveMap(userId, map);
  return next;
}

function applyToRecord(record, userId, map, now) {
  if (!record) return { record, dirty: false };
  const next = { ...record };
  let dirty = false;

  if (next.imageUrl) {
    const r = resolveWithMap(next.imageUrl, next.imageUrlPath, map, now);
    next.imageUrl = r.url;
    dirty = dirty || r.dirty;
  }

  if (Array.isArray(next.imageUrls)) {
    const paths = Array.isArray(next.imagePaths) ? next.imagePaths : [];
    next.imageUrls = next.imageUrls.map((u, i) => {
      const r = resolveWithMap(u, paths[i] || extractUploadPath(u), map, now);
      dirty = dirty || r.dirty;
      return r.url;
    });
  }

  if (Array.isArray(next.imageMeta)) {
    next.imageMeta = next.imageMeta.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const path = m.path || extractUploadPath(m.url);
      if (!m.url) return { ...m, path };
      const r = resolveWithMap(m.url, path, map, now);
      dirty = dirty || r.dirty;
      return { ...m, path, url: r.url };
    });
  }

  return { record: next, dirty };
}

export function applyImageUrlCacheToRecords(records, userId) {
  if (!Array.isArray(records)) return [];
  const map = loadMap(userId);
  const now = Math.floor(Date.now() / 1000);
  let dirty = false;
  const out = records.map((r) => {
    const applied = applyToRecord(r, userId, map, now);
    dirty = dirty || applied.dirty;
    return applied.record;
  });
  if (dirty) saveMap(userId, map);
  return out;
}

export function clearImageUrlCache(userId) {
  if (!userId) return;
  try {
    uni.removeStorageSync(cacheKey(userId));
  } catch {
    // ignore
  }
}
