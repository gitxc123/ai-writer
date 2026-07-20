/** 预制可爱动物头像（按 id 稳定展示） */

export const AVATAR_PRESETS = [
  { id: 'bunny', emoji: '🐰', bg: '#FFE8F0', label: '兔子' },
  { id: 'cat', emoji: '🐱', bg: '#FFF0E0', label: '小猫' },
  { id: 'dog', emoji: '🐶', bg: '#E8F4FF', label: '小狗' },
  { id: 'bear', emoji: '🐻', bg: '#F3E8D8', label: '小熊' },
  { id: 'panda', emoji: '🐼', bg: '#F0F0F0', label: '熊猫' },
  { id: 'fox', emoji: '🦊', bg: '#FFE4D6', label: '狐狸' },
  { id: 'koala', emoji: '🐨', bg: '#E8F0E8', label: '考拉' },
  { id: 'tiger', emoji: '🐯', bg: '#FFF5D6', label: '小虎' },
  { id: 'lion', emoji: '🦁', bg: '#FFEFD0', label: '狮子' },
  { id: 'frog', emoji: '🐸', bg: '#E4F7E4', label: '青蛙' },
  { id: 'chick', emoji: '🐥', bg: '#FFF8D8', label: '小鸡' },
  { id: 'penguin', emoji: '🐧', bg: '#E8EEF8', label: '企鹅' },
  { id: 'unicorn', emoji: '🦄', bg: '#F3E8FF', label: '独角兽' },
  { id: 'owl', emoji: '🦉', bg: '#EDE6DC', label: '猫头鹰' },
  { id: 'hamster', emoji: '🐹', bg: '#FFEDE0', label: '仓鼠' },
  { id: 'otter', emoji: '🦦', bg: '#E6F2F0', label: '水獭' }
];

const BY_ID = Object.fromEntries(AVATAR_PRESETS.map((a) => [a.id, a]));

export function pickRandomAvatarId() {
  const i = Math.floor(Math.random() * AVATAR_PRESETS.length);
  return AVATAR_PRESETS[i].id;
}

export function resolveAvatar(avatarId, seed = '') {
  if (avatarId && BY_ID[avatarId]) return BY_ID[avatarId];
  if (seed) {
    let h = 0;
    const s = String(seed);
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_PRESETS[h % AVATAR_PRESETS.length];
  }
  return AVATAR_PRESETS[0];
}

export function isValidAvatarId(id) {
  return Boolean(id && BY_ID[id]);
}
