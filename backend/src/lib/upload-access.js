import path from 'path';
import { uploadsRequireSignature, verifyUploadSignature } from './upload-sign.js';

/**
 * 在 express.static 之前：校验路径仅为文件名，生产要求 e/s 签名。
 */
export function uploadAccessMiddleware(req, res, next) {
  const rel = String(req.path || '').replace(/^\/+/, '');
  const filename = path.basename(rel);

  if (!filename || filename === '.' || filename === '..') {
    return res.status(400).send('Bad request');
  }
  // 拒绝子路径 /uploads/a/b
  if (rel !== filename) {
    return res.status(400).send('Bad request');
  }

  if (!uploadsRequireSignature()) {
    return next();
  }

  const exp = req.query.e || req.query.exp;
  const sig = req.query.s || req.query.sig;
  if (!verifyUploadSignature(filename, exp, sig)) {
    return res.status(401).send('Unauthorized');
  }
  return next();
}
