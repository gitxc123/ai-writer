const CACHE_PREFIX = 'records_cache_v1';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const RUNNING_TTL_MS = 30 * 1000;

function cacheKey(userId) {
  return `${CACHE_PREFIX}:${userId}`;
}

export function loadRecordsCache(userId) {
  if (!userId) return null;
  try {
    const raw = uni.getStorageSync(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRecordsCache(userId, records) {
  if (!userId || !Array.isArray(records)) return;
  try {
    uni.setStorageSync(
      cacheKey(userId),
      JSON.stringify({
        fetchedAt: Date.now(),
        records
      })
    );
  } catch {
    // storage full — ignore
  }
}

export function clearRecordsCache(userId) {
  if (!userId) return;
  try {
    uni.removeStorageSync(cacheKey(userId));
  } catch {
    // ignore
  }
}

function hasRunningTask(records) {
  return records.some((r) => r.status === 'pending' || r.status === 'processing');
}

export function getRecordsCacheTtl(records = []) {
  return hasRunningTask(records) ? RUNNING_TTL_MS : DEFAULT_TTL_MS;
}

export function isRecordsCacheFresh(cached) {
  if (!cached?.fetchedAt || !Array.isArray(cached.records)) return false;
  return Date.now() - cached.fetchedAt < getRecordsCacheTtl(cached.records);
}
