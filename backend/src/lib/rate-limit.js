/**
 * 简易内存限流（单实例有效；多实例需上 Redis）。
 */

const buckets = new Map();

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * @param {{ windowMs: number, max: number, key?: (req) => string, message?: string }} opts
 */
export function rateLimit(opts) {
  const windowMs = opts.windowMs || 60_000;
  const max = opts.max || 60;
  const message = opts.message || '请求过于频繁，请稍后再试';
  const keyFn = opts.key || ((req) => clientIp(req));

  return function rateLimitMiddleware(req, res, next) {
    const key = `${opts.name || 'rl'}:${keyFn(req)}`;
    const now = Date.now();
    let hit = buckets.get(key);
    if (!hit || now - hit.start > windowMs) {
      hit = { count: 0, start: now };
    }
    hit.count += 1;
    buckets.set(key, hit);

    if (hit.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((hit.start + windowMs - now) / 1000)));
      return res.status(429).json({ code: 429, message });
    }
    return next();
  };
}

export function ipKey(req) {
  return clientIp(req);
}

export function userOrIpKey(req) {
  return req.userId ? `u:${req.userId}` : `ip:${clientIp(req)}`;
}

/** 测试或定时清理过期桶，避免 Map 无限增长 */
export function pruneRateBuckets(now = Date.now(), maxAgeMs = 120_000) {
  for (const [k, v] of buckets) {
    if (now - v.start > maxAgeMs) buckets.delete(k);
  }
}

// 每 5 分钟清一次
setInterval(() => pruneRateBuckets(), 300_000).unref?.();
