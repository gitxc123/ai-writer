import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UPLOAD_DIR as DEFAULT_UPLOAD_DIR } from './public-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveUploadDir() {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  return DEFAULT_UPLOAD_DIR || path.resolve(__dirname, '../../uploads');
}

function collectUploadBasenames(record) {
  const names = new Set();
  const push = (url) => {
    const raw = String(url || '').trim().split('?')[0];
    if (!raw.startsWith('/uploads/')) return;
    const base = path.basename(raw);
    if (!base || base === '.' || base === '..') return;
    // 仅允许简单文件名，拒绝穿越
    if (base.includes('..') || /[/\\]/.test(base)) return;
    names.add(base);
  };

  push(record?.imageUrl);
  try {
    const urls = record?.imageUrls ? JSON.parse(record.imageUrls) : [];
    if (Array.isArray(urls)) urls.forEach(push);
  } catch {
    /* ignore */
  }
  try {
    const meta = record?.imageMeta ? JSON.parse(record.imageMeta) : [];
    if (Array.isArray(meta)) {
      meta.forEach((m) => {
        push(m?.url);
      });
    }
  } catch {
    /* ignore */
  }
  return [...names];
}

/** 删除记录关联的本地 /uploads 文件；忽略缺失文件 */
export function deleteUploadFilesForRecord(record) {
  const names = collectUploadBasenames(record);
  const dir = resolveUploadDir();
  let deleted = 0;
  for (const name of names) {
    const filePath = path.join(dir, name);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        deleted += 1;
      }
    } catch (err) {
      console.warn('[upload-cleanup] unlink failed', name, err.message);
    }
  }
  return deleted;
}

export function listUploadBasenamesForRecord(record) {
  return collectUploadBasenames(record);
}
