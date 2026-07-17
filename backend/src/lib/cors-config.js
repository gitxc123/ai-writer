import { isProduction } from './security-config.js';

/**
 * 生产：仅允许 CORS_ORIGINS / PUBLIC_BASE_URL 列表中的来源。
 * 本地：额外允许 localhost:5173。
 */
export function buildCorsOptions() {
  const fromEnv = String(process.env.CORS_ORIGINS || process.env.PUBLIC_BASE_URL || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allow = new Set(fromEnv);
  if (!isProduction()) {
    allow.add('http://localhost:5173');
    allow.add('http://127.0.0.1:5173');
    allow.add('http://localhost:3001');
    allow.add('http://127.0.0.1:3001');
  }

  // 同源托管（Express 同时提供 H5）时浏览器可能不带 Origin
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allow.size === 0) {
        // 生产未配置白名单：拒绝（fail-closed）；本地仍放行
        if (isProduction()) {
          console.warn('[cors] CORS_ORIGINS/PUBLIC_BASE_URL 未配置，已拒绝跨域请求');
          return callback(null, false);
        }
        return callback(null, true);
      }
      if (allow.has(normalized)) return callback(null, true);
      console.warn('[cors] blocked origin', origin);
      return callback(null, false);
    },
    credentials: true
  };
}
