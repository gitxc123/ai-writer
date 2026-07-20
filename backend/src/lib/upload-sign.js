import crypto from 'crypto';
import { isProduction, resolveJwtSecret } from './security-config.js';

function hmacSecret() {
  const r = resolveJwtSecret();
  return r.ok ? r.secret : 'dev-secret-local-only';
}

/** 生产默认要求签名；UPLOADS_PUBLIC=1 可强制公开；UPLOADS_REQUIRE_SIGN=1 本地也可强制 */
export function uploadsRequireSignature() {
  const pub = String(process.env.UPLOADS_PUBLIC || '').trim();
  if (/^(1|true|yes|on)$/i.test(pub)) return false;
  const req = String(process.env.UPLOADS_REQUIRE_SIGN || '').trim();
  if (/^(1|true|yes|on)$/i.test(req)) return true;
  if (/^(0|false|off|no)$/i.test(req)) return false;
  return isProduction();
}

export function getUploadSignTtlSec() {
  const n = Number(process.env.UPLOAD_SIGN_TTL_SEC || 7 * 24 * 3600);
  return Number.isFinite(n) && n > 60 ? Math.floor(n) : 7 * 24 * 3600;
}

function signPayload(filename, exp) {
  return crypto
    .createHmac('sha256', hmacSecret())
    .update(`${filename}:${exp}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * @returns {{ exp: number, sig: string }}
 */
export function createUploadSignature(filename, ttlSec = getUploadSignTtlSec()) {
  const base = String(filename || '').replace(/^.*[/\\]/, '');
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return { exp, sig: signPayload(base, exp) };
}

export function verifyUploadSignature(filename, exp, sig) {
  const base = String(filename || '').replace(/^.*[/\\]/, '');
  const e = Number(exp);
  const s = String(sig || '');
  if (!base || !Number.isFinite(e) || !s) return false;
  if (e < Math.floor(Date.now() / 1000)) return false;
  const expected = signPayload(base, e);
  try {
    if (expected.length !== s.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s));
  } catch {
    return false;
  }
}

/**
 * 给 /uploads/xxx 或完整 URL 追加签名查询参数；非 uploads 路径原样返回。
 */
export function withUploadSignature(url, ttlSec) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (!uploadsRequireSignature()) return raw;

  let pathPart = raw;
  let origin = '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      pathPart = u.pathname;
      origin = `${u.protocol}//${u.host}`;
    } catch {
      return raw;
    }
  }

  if (!pathPart.startsWith('/uploads/')) return raw;
  const filename = pathPart.slice('/uploads/'.length).split('?')[0].split('/')[0];
  if (!filename || filename.includes('..')) return raw;

  const { exp, sig } = createUploadSignature(filename, ttlSec);
  const signedPath = `/uploads/${filename}?e=${exp}&s=${sig}`;
  return origin ? `${origin}${signedPath}` : signedPath;
}

/**
 * 从签名 URL 或路径提取稳定的 /uploads/xxx（用于客户端复用缓存）
 */
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

/** 列表项附带稳定 upload 路径，便于前端缓存缩略图 URL */
export function attachUploadPaths(record) {
  if (!record) return record;
  const next = { ...record };
  next.imageUrlPath = extractUploadPath(next.imageUrl);
  next.imagePaths = Array.isArray(next.imageUrls)
    ? next.imageUrls.map((u) => extractUploadPath(u)).filter(Boolean)
    : [];
  if (Array.isArray(next.imageMeta)) {
    next.imageMeta = next.imageMeta.map((m) =>
      m && typeof m === 'object'
        ? { ...m, path: extractUploadPath(m.url) || m.path || null }
        : m
    );
  }
  return next;
}

/** 批量给记录里的本地图链签名（API 出站） */
export function signRecordImageFields(record) {
  if (!record || !uploadsRequireSignature()) return record;
  const next = { ...record };
  if (next.imageUrl) next.imageUrl = withUploadSignature(next.imageUrl);
  if (Array.isArray(next.imageUrls)) {
    next.imageUrls = next.imageUrls.map((u) => withUploadSignature(u));
  }
  if (Array.isArray(next.imageMeta)) {
    next.imageMeta = next.imageMeta.map((m) =>
      m && typeof m === 'object'
        ? { ...m, url: m.url ? withUploadSignature(m.url) : m.url }
        : m
    );
  }
  return next;
}
