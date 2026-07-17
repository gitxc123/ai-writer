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
    return uploadLocalForAgnes(filePath);
  }

  if (storedUrl.startsWith('file:')) {
    const filePath = fileURLToPath(storedUrl);
    if (!isPathUnderDir(filePath, UPLOAD_DIR)) {
      throw new Error(
        'file: URL 必须位于上传目录内 / file: URL must be under the upload directory'
      );
    }
    return uploadLocalForAgnes(filePath);
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

/** Litterbox（Catbox 临时链，24h）— uguu 被 Comfy 拒收时的备用 */
export async function uploadToLitterbox(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`文件不存在 / file not found: ${resolved}`);
  }
  const buf = fs.readFileSync(resolved);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '24h');
  form.append('fileToUpload', new Blob([buf]), path.basename(resolved));
  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  const text = (await res.text()).trim();
  if (!res.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(`Litterbox 上传失败: ${text.slice(0, 160) || `HTTP ${res.status}`}`);
  }
  return text;
}

export function localPathFromUploadUrl(storedUrl) {
  if (!storedUrl || !String(storedUrl).startsWith('/uploads/')) return null;
  const filePath = path.join(UPLOAD_DIR, path.basename(storedUrl));
  return fs.existsSync(filePath) ? filePath : null;
}

function guessImageExt(url, contentType) {
  const fromType = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (fromType === 'image/jpeg' || fromType === 'image/jpg') return 'jpg';
  if (fromType === 'image/png') return 'png';
  if (fromType === 'image/webp') return 'webp';
  if (fromType === 'image/gif') return 'gif';
  const m = String(url || '').match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  return (m?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
}

/**
 * 把远程配图落到本地 /uploads，避免 Agnes/外站链接过期或被头条等平台拒抓。
 * 已是本地路径则原样返回。
 */
export async function mirrorRemoteImageToUpload(remoteUrl) {
  if (!remoteUrl) throw new Error('空图片地址');
  const raw = String(remoteUrl).trim();
  if (raw.startsWith('/uploads/')) return raw;

  if (!/^https?:\/\//i.test(raw)) {
    throw new Error('仅支持 http(s) 远程地址或 /uploads/ 本地路径');
  }

  const res = await fetch(raw, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) {
    throw new Error(`下载配图失败 HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) {
    throw new Error('下载配图失败：文件过小');
  }

  ensureUploadDir();
  const ext = guessImageExt(raw, res.headers.get('content-type'));
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  return `/uploads/${filename}`;
}

/** 尽量镜像到本地；失败则保留原 URL */
export async function persistImageUrl(remoteUrl) {
  if (!remoteUrl) return remoteUrl;
  if (String(remoteUrl).startsWith('/uploads/')) return remoteUrl;
  try {
    return await mirrorRemoteImageToUpload(remoteUrl);
  } catch (err) {
    console.warn('[public-url] mirror failed, keep remote:', err.message);
    return remoteUrl;
  }
}

/** 本地上传文件 → 公网 URL；优先 uguu，失败再 litterbox */
export async function uploadLocalForAgnes(filePath, preferred = 'uguu') {
  const order =
    preferred === 'litterbox' ? [uploadToLitterbox, uploadToUguu] : [uploadToUguu, uploadToLitterbox];
  let lastErr;
  for (const upload of order) {
    try {
      return await upload(filePath);
    } catch (err) {
      lastErr = err;
      console.warn('[public-url]', upload.name, err.message);
    }
  }
  throw lastErr || new Error('图床上传失败');
}
