export const WEB_IMAGE_FOOTER_MARKER = '【配图来源】';

export function splitArticleOutput(text) {
  const marker = `\n\n---\n${WEB_IMAGE_FOOTER_MARKER}`;
  const idx = (text || '').indexOf(marker);
  if (idx === -1) {
    return { body: text || '', footer: '' };
  }
  return {
    body: text.slice(0, idx).trimEnd(),
    footer: text.slice(idx + 6).trimStart()
  };
}

export const WEB_IMAGE_SUBMIT_HINT =
  '选择网络现场图时，文章末尾将自动附上配图来源说明与免责声明，复制发布即可。';
