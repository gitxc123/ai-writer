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
  '选择网络现场图时，文章末尾将附上来源与免责声明；本服务不授予图片版权，发布前须自行取得授权。';

export const AI_IMAGE_SUBMIT_HINT =
  '选择 AI 配图时，每张图会标注「AI 生成，非现场真实照片」，文章末尾同步附上来源说明与免责声明。';

export const AI_IMAGE_CREDIT = 'AI 生成配图，非现场真实照片';
