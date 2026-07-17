export const WEB_IMAGE_FOOTER_MARKER = '【配图来源】';
export const AI_TEXT_FOOTER_MARKER = '【AI 生成说明】';

export function splitArticleOutput(text) {
  const raw = text || '';
  let cut = -1;
  for (const marker of [WEB_IMAGE_FOOTER_MARKER, AI_TEXT_FOOTER_MARKER]) {
    const withRule = `\n\n---\n${marker}`;
    const idx = raw.indexOf(withRule);
    if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx;
  }
  if (cut === -1) {
    return { body: raw, footer: '' };
  }
  return {
    body: raw.slice(0, cut).trimEnd(),
    footer: raw.slice(cut + 6).trimStart()
  };
}

export const WEB_IMAGE_SUBMIT_HINT =
  '选择网络现场图时，文章末尾将附上来源与免责声明；本服务不授予图片版权，发布前须自行取得授权。';

export const AI_IMAGE_SUBMIT_HINT =
  '选择 AI 配图时，每张图会标注「AI 生成，非现场真实照片」，文章末尾同步附上来源说明与免责声明。正文将标注「AI 辅助生成」。';

export const AI_IMAGE_CREDIT = 'AI 生成配图，非现场真实照片';

/** 平台导出用短声明（小红书等篇幅受限场景） */
export function buildCompactComplianceNote({ footer = '', images = [] } = {}) {
  const parts = ['内容含 AI 辅助生成'];
  const imgs = images || [];
  const hasAi = imgs.some(
    (i) => i?.sourceType === 'ai' || i?.sourceType === 'product' || /AI\s*生成/.test(String(i?.credit || ''))
  );
  const hasWeb = imgs.some(
    (i) => i?.sourceType === 'web' || /网络|检索/.test(String(i?.credit || ''))
  );
  if (hasAi) parts.push('配图为 AI 生成/编辑示意，非现场实拍');
  if (hasWeb) parts.push('网络配图不授予版权，发布前须自行授权');
  if (!hasAi && !hasWeb && footer) {
    if (/配图来源|网络/.test(footer)) parts.push('配图请按文末声明自行核权');
  }
  return `${parts.join('；')}。`;
}
