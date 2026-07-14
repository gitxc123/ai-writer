import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function isPathUnderDir(filePath, dir) {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep);
}

function isUsablePublicBase(publicBase) {
  return (
    Boolean(publicBase) &&
    /^https:\/\//i.test(publicBase) &&
    !/localhost|127\.0\.0\.1/i.test(publicBase)
  );
}

/** 把本地相对路径或本机 URL 转成 Agnes 可访问的 https URL */
export async function resolveAgnesImageUrl(storedUrl) {
  if (!storedUrl) throw new Error('空图片地址 / empty image URL');

  if (/^https?:\/\//i.test(storedUrl) && !/localhost|127\.0\.0\.1/i.test(storedUrl)) {
    return storedUrl;
  }

  if (storedUrl.startsWith('/uploads/')) {
    const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    if (isUsablePublicBase(publicBase)) {
      return `${publicBase}${storedUrl}`;
    }

    const filePath = path.join(UPLOAD_DIR, path.basename(storedUrl));
    return uploadToUguu(filePath);
  }

  if (storedUrl.startsWith('file:')) {
    const filePath = fileURLToPath(storedUrl);
    if (!isPathUnderDir(filePath, UPLOAD_DIR)) {
      throw new Error(
        'file: URL 必须位于上传目录内 / file: URL must be under the upload directory'
      );
    }
    return uploadToUguu(filePath);
  }

  throw new Error(
    '不支持的图片地址：仅允许公网 http(s)、/uploads/ 路径或上传目录下的 file: URL / unsupported image URL: only public http(s), /uploads/ paths, or file: URLs under the upload directory are allowed'
  );
}

export async function uploadToUguu(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`文件不存在 / file not found: ${resolved}`);
  }

  const buf = fs.readFileSync(resolved);
  const filename = path.basename(resolved);
  const boundary = '----FormBoundary' + Date.now().toString(16);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const res = await fetch('https://uguu.se/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(120000)
  });

  if (!res.ok) {
    throw new Error(`图床上传失败 / temporary image host upload failed (HTTP ${res.status})`);
  }

  const data = await res.json().catch(() => ({}));

  if (data.success === false) {
    const desc = data.description || data.error || 'unknown error';
    throw new Error(`图床上传失败 / temporary image host upload failed: ${desc}`);
  }

  const url = data?.files?.[0]?.url;
  if (!url) {
    throw new Error('图床上传失败：响应无 URL / temporary image host upload failed: no URL in response');
  }
  return url;
}
