import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { publicUser } from './membership.js';
import { deleteUserAccount } from '../lib/account.js';
import { ensureUserAvatar, assignAvatarOnCreate } from '../lib/avatars.js';
import { logUserRegister } from '../lib/logger.js';

const router = Router();

function truthyFlag(v) {
  return v === true || v === 1 || /^(1|true|yes|on)$/i.test(String(v ?? '').trim());
}

router.post('/register', async (req, res) => {
  const { phone, password, nickName, acceptedTerms, ageConfirmed } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
  }
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '手机号格式不正确' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少6位' });
  }
  if (!truthyFlag(acceptedTerms)) {
    return res.status(400).json({ code: 400, message: '请先同意用户协议和隐私政策' });
  }
  if (!truthyFlag(ageConfirmed)) {
    return res.status(400).json({ code: 400, message: '本服务仅向年满18周岁用户开放，请确认后注册' });
  }

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) {
    return res.status(400).json({ code: 400, message: '手机号已注册' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash,
      nickName: nickName || `用户${phone.slice(-4)}`
    }
  });
  const avatar = await assignAvatarOnCreate(prisma, user.id);
  user.avatar = avatar;

  try {
    await prisma.$executeRawUnsafe(
      'UPDATE User SET termsAcceptedAt = ?, ageConfirmedAt = ? WHERE id = ?',
      now.toISOString(),
      now.toISOString(),
      user.id
    );
  } catch (err) {
    console.warn('[auth] terms/age columns', err.message);
  }

  await logUserRegister(user);

  // 不自动签发登录态：前端须引导至登录页重新登录
  res.json({
    code: 200,
    data: { registered: true, user: publicUser(user) }
  });
});

router.post('/login', async (req, res) => {
  const { phone, password, acceptedTerms } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
  }
  if (!truthyFlag(acceptedTerms)) {
    return res.status(400).json({ code: 400, message: '请先同意用户协议和隐私政策' });
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return res.status(400).json({ code: 400, message: '用户不存在' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(400).json({ code: 400, message: '密码错误' });
  }
  const ensured = await ensureUserAvatar(prisma, user);
  const token = signToken(ensured.id);
  res.json({
    code: 200,
    data: { token, user: publicUser(ensured) }
  });
});

/** 注销账号：需登录并验证密码；不可恢复 */
router.post('/delete-account', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    const confirm = String(req.body?.confirm || '').trim();
    if (!password) {
      return res.status(400).json({ code: 400, message: '请输入密码以确认注销' });
    }
    if (confirm !== '注销账号') {
      return res.status(400).json({
        code: 400,
        message: '请在确认框输入「注销账号」'
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ code: 400, message: '密码错误' });
    }

    const result = await deleteUserAccount(user.id);
    console.log('[auth] account deleted', user.id, result);
    res.json({
      code: 200,
      data: {
        message: '账号已注销',
        records: result.records,
        files: result.files
      }
    });
  } catch (err) {
    console.error('[auth:delete-account]', err);
    res.status(500).json({ code: 500, message: err.message || '注销失败' });
  }
});

export default router;
