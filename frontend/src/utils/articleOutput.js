export const WEB_IMAGE_FOOTER_MARKER = '【配图来源】';
export const AI_TEXT_FOOTER_MARKER = '【AI 生成说明】';
export const COMPACT_NOTE_MARKER = '【说明】';
export const AUDIENCE_LABEL_MARKER = '【标识】';
export const IMAGE_LABEL_MARKER = '【作者声明】';

export function splitArticleOutput(text) {
  const raw = text || '';
  let cut = -1;
  for (const marker of [
    WEB_IMAGE_FOOTER_MARKER,
    AI_TEXT_FOOTER_MARKER,
    COMPACT_NOTE_MARKER,
    AUDIENCE_LABEL_MARKER,
    IMAGE_LABEL_MARKER
  ]) {
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

/** 服务 → 用户（只展示在创作页，不写入文稿） */
export const WEB_IMAGE_SUBMIT_HINT =
  '网络配图版权归原权利人；本服务不授予使用权。发布前请自行取得授权，并核实图文是否匹配。';

export const AI_IMAGE_SUBMIT_HINT =
  'AI 配图为示意、非现场实拍。发布前请自行核实正文事实；如平台要求标注 AI，请自行添加。';

export const PUBLISH_REMINDER =
  '复制发布前请自行核实内容与素材权利；因发布产生的法律责任由你自行承担。如目标平台要求标注 AI，请自行添加。';

/** 平台给用户看的发布须知（产品内展示，绝不写入文稿） */
export const PLATFORM_USER_NOTICES = [
  '本产品生成的内容仅供创作参考，不构成新闻供稿、事实认定或专业意见。',
  '发布前请自行核实事实、图文匹配与合法性；目标平台若要求标注 AI，请自行添加。',
  '网络配图版权归原作者/平台；AI 配图为示意非实拍。本服务不授予素材版权或使用权，发布前须自行取得授权或更换已获授权素材。',
  '因使用或发布本文内容及配图所产生的法律责任，由你作为发布者自行承担。'
];

export const AI_IMAGE_CREDIT = 'AI 生成配图，非现场真实照片';
export const PRODUCT_IMAGE_CREDIT = '基于用户上传产品图的 AI 生成/编辑，非实拍成片';

/** 写入文稿的【作者声明】正文（面向观众） */
export const AUTHOR_STATEMENT_AI =
  '本文配图均为人工智能生成，并非真实拍摄照片，仅供示意与参考。';

export const AUTHOR_STATEMENT_WEB =
  '本文配图来源于网络公开检索，其真实性及与正文所述情形是否一致有待核实；图片权利归原作者或原平台所有。如权利人认为侵权，请联系发布者删除。';

export const AUTHOR_STATEMENT_PRODUCT =
  '本文配图基于上传素材经人工智能生成或编辑，并非未加说明的实拍成片，仅供产品展示参考。';

function resolveAuthorStatement(imageSource = '', imageMeta = []) {
  const src =
    imageSource ||
    (imageMeta.some((i) => i?.sourceType === 'web')
      ? 'web'
      : imageMeta.some((i) => i?.sourceType === 'product')
        ? 'product'
        : 'ai');
  if (src === 'web') return AUTHOR_STATEMENT_WEB;
  if (src === 'product') return AUTHOR_STATEMENT_PRODUCT;
  return AUTHOR_STATEMENT_AI;
}

function stripUrls(s = '') {
  return String(s)
    .replace(/（\s*https?:\/\/[^）]*）/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 清洗旧版文末：统一为当前【作者声明】句式。
 */
export function sanitizeLegacyAudienceFooter(footer = '') {
  const raw = String(footer || '');
  if (!raw.trim()) return '';
  if (/网络公开|Pexels|图库|公开检索/.test(raw) && !/人工智能生成配图|均为人工智能生成/.test(raw)) {
    return `【作者声明】\n${AUTHOR_STATEMENT_WEB}`;
  }
  if (/AI|人工智能|非现场|非真实拍摄|用户上传/.test(raw)) {
    if (/用户上传/.test(raw)) return `【作者声明】\n${AUTHOR_STATEMENT_PRODUCT}`;
    return `【作者声明】\n${AUTHOR_STATEMENT_AI}`;
  }
  let t = raw;
  t = t.replace(/\n*【免责声明】[\s\S]*/g, '');
  t = t.replace(/【AI 生成说明】[\s\S]*?(?=\n【|$)/g, '');
  t = t.replace(/【说明】[^\n]*/g, '');
  t = t.replace(/【标识】[^\n]*/g, '');
  t = t.replace(/【配图来源】/g, '【作者声明】');
  t = t.replace(/【配图】/g, '【作者声明】');
  t = stripUrls(t);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 面向观众的【作者声明】（按配图来源区分，写入文稿 / 复制内容）。
 */
export function buildAudienceFacingAppendix({
  imageMeta = [],
  imageSource = '',
  legacyFooter = ''
} = {}) {
  const imgs = (imageMeta || []).filter((i) => i && (i.caption || i.credit || i.url || i.remoteUrl));
  if (imgs.length) {
    return `【作者声明】\n${resolveAuthorStatement(imageSource, imgs)}`;
  }
  if (legacyFooter) {
    const cleaned = sanitizeLegacyAudienceFooter(legacyFooter);
    if (cleaned) return cleaned;
  }
  return '';
}

/** 正文 + 面向读者的短附录（复制/导出用） */
export function withAudienceFacingOutput(rawOutput, opts = {}) {
  const { body, footer } = splitArticleOutput(rawOutput);
  const appendix = buildAudienceFacingAppendix({
    ...opts,
    legacyFooter: footer
  });
  if (!body) return appendix ? `---\n${appendix}` : '';
  if (!appendix) return body;
  return `${body}\n\n---\n${appendix}`;
}

/** 平台导出用短声明：只含面向读者的配图信息 */
export function buildCompactComplianceNote({ footer = '', images = [] } = {}) {
  const imgs = images || [];
  const hasAi = imgs.some(
    (i) => i?.sourceType === 'ai' || i?.sourceType === 'product' || /AI\s*生成/.test(String(i?.credit || ''))
  );
  const hasWeb = imgs.some(
    (i) => i?.sourceType === 'web' || /网络|检索/.test(String(i?.credit || ''))
  );
  const parts = [];
  if (hasAi) parts.push('配图为 AI 示意，非实拍');
  if (hasWeb) parts.push('配图来自网络检索');
  if (!parts.length && footer && /配图|网络/.test(footer)) {
    parts.push('详见文末配图标注');
  }
  return parts.length ? `${parts.join('；')}。` : '';
}
