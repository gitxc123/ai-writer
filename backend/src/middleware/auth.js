import jwt from 'jsonwebtoken';
import { resolveJwtSecret } from '../lib/security-config.js';

function jwtSecret() {
  const r = resolveJwtSecret();
  if (!r.ok) throw new Error(r.message);
  return r.secret;
}

export function signToken(userId) {
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: '7d' });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' });
  }
}
