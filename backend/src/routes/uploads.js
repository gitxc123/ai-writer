import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth.js';
import { ensureUploadDir, UPLOAD_DIR } from '../lib/public-url.js';

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('仅支持 jpg/png/webp'), ok);
  }
});

const router = Router();
const SLOTS = new Set(['front', 'side', 'detail']);

router.post('/product', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ code: 400, message: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '缺少文件' });
    }
    const slot = SLOTS.has(req.body?.slot) ? req.body.slot : 'front';
    const url = `/uploads/${req.file.filename}`;
    res.json({ code: 200, data: { slot, url, filename: req.file.filename } });
  });
});

export default router;
