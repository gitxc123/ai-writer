import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** 把本地相对路径或本机 URL 转成 Agnes 可访问的 https URL */
export async function resolveAgnesImageUrl(storedUrl) {
  if (!storedUrl) throw new Error('空图片地址');
  if (/^https?:\/\//i.test(storedUrl) && !/localhost|127\.0\.0\.1/i.test(storedUrl)) {
    return storedUrl;
  }

  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (publicBase && storedUrl.startsWith('/uploads/')) {
    return `${publicBase}${storedUrl}`;
  }

  const filePath = storedUrl.startsWith('/uploads/')
    ? path.join(UPLOAD_DIR, path.basename(storedUrl))
    : storedUrl.startsWith('file:')
      ? fileURLToPath(storedUrl)
      : storedUrl;

  return uploadToUguu(filePath);
}

async function uploadToUguu(filePath) {
  const buf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
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
  const data = await res.json();
  const url = data?.files?.[0]?.url;
  if (!url) throw new Error('临时图床上传失败');
  return url;
}
