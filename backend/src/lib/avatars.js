/** 预制可爱动物头像 id，与前端 presets 保持一致 */

export const AVATAR_IDS = [
  'bunny',
  'cat',
  'dog',
  'bear',
  'panda',
  'fox',
  'koala',
  'tiger',
  'lion',
  'frog',
  'chick',
  'penguin',
  'unicorn',
  'owl',
  'hamster',
  'otter'
];

const ID_SET = new Set(AVATAR_IDS);

export function pickRandomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export function isValidAvatarId(id) {
  return ID_SET.has(String(id || ''));
}

async function readAvatar(prisma, userId) {
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT avatar FROM User WHERE id = ? LIMIT 1', userId);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.avatar || '';
  } catch {
    return '';
  }
}

async function writeAvatar(prisma, userId, avatar) {
  await prisma.$executeRawUnsafe('UPDATE User SET avatar = ? WHERE id = ?', avatar, userId);
}

/**
 * 若用户尚无头像则随机分配并写库。
 * @returns {Promise<object>} 可能已更新的 user
 */
export async function ensureUserAvatar(prisma, user) {
  if (!user?.id) return user;
  let current = user.avatar;
  if (!isValidAvatarId(current)) {
    current = await readAvatar(prisma, user.id);
  }
  if (isValidAvatarId(current)) {
    return { ...user, avatar: current };
  }
  const avatar = pickRandomAvatarId();
  try {
    await writeAvatar(prisma, user.id, avatar);
    return { ...user, avatar };
  } catch (err) {
    console.warn('[avatar] ensure', err.message);
    return { ...user, avatar };
  }
}

export async function assignAvatarOnCreate(prisma, userId) {
  const avatar = pickRandomAvatarId();
  try {
    await writeAvatar(prisma, userId, avatar);
  } catch (err) {
    console.warn('[avatar] assign', err.message);
  }
  return avatar;
}
