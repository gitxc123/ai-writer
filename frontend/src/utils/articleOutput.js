export const WEB_IMAGE_FOOTER_MARKER = '【配图来源】';
export const AI_TEXT_FOOTER_MARKER = '【AI 生成说明】';
export const COMPACT_NOTE_MARKER = '【说明】';
export const AUDIENCE_LABEL_MARKER = '【标识】';
export const IMAGE_LABEL_MARKER = '【配图】';

export function splitArticleOutput(text) {
  const raw = text || '';
  let cut = -1;
  for (const marker of [
    WEB_IMAGE_FOOTER_MARKER,
    AI_TEXT_FOOTER_MARKER,
    COMPACT_NOTE_MARKER,
    AUDIENCE_LABEL_MARKER
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
  'AI 配图为示意、非现场实拍。发布前请按平台规则标注，并自行核实正文事实。';

export const PUBLISH_REMINDER =
  '复制发布前请自行核实内容与素材权利；因发布产生的法律责任由你自行承担。文稿中仅保留面向读者的 AI/配图标识。';

export const AI_IMAGE_CREDIT = 'AI 生成配图，非现场真实照片';
export const PRODUCT_IMAGE_CREDIT = '基于用户上传产品图的 AI 生成/编辑，非实拍成片';

function stripUrls(s = '') {
  return String(s)
    .replace(/（\s*https?:\/\/[^）]*）/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 清洗旧版文末：去掉【免责声明】及对作者的服务提醒，去掉长链接。
 */
export function sanitizeLegacyAudienceFooter(footer = '') {
  let t = String(footer || '');
  t = t.replace(/\n*【免责声明】[\s\S]*/g, '');
  t = t.replace(/【AI 生成说明】[\s\S]*?(?=\n【|$)/, '【标识】本文由人工智能辅助生成。\n');
  t = t.replace(/【说明】[^\n]*/g, '【标识】本文由人工智能辅助生成。');
  t = t.replace(/【配图来源】/g, '【配图】');
  t = stripUrls(t);
  t = t
    .split('\n')
    .filter((line) => {
      const s = line.trim();
      if (!s) return true;
      if (/责任由|本服务不授予|发布前须|请自行|请核实|请按平台|不代表任何官方|侵权/.test(s)) {
        return false;
      }
      if (/^\d+\.\s/.test(s) && /授权|责任|核实|投诉|版权/.test(s)) return false;
      return true;
    })
    .join('\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 面向读者的短附录（用于展示与复制）。优先用 imageMeta 重建，避免旧任务仍带长免责。
 */
export function buildAudienceFacingAppendix({
  imageMeta = [],
  imageSource = '',
  legacyFooter = ''
} = {}) {
  const lines = ['【标识】本文由人工智能辅助生成。'];
  const imgs = (imageMeta || []).filter((i) => i && (i.caption || i.credit || i.url || i.remoteUrl));
  if (imgs.length) {
    lines.push('【配图】');
    imgs.forEach((item, i) => {
      const caption = String(item.caption || '配图').trim();
      let credit = stripUrls(item.credit || '');
      if (!credit) {
        const src = item.sourceType || imageSource;
        if (src === 'web') credit = '网络公开检索';
        else if (src === 'product') credit = PRODUCT_IMAGE_CREDIT;
        else credit = AI_IMAGE_CREDIT;
      }
      lines.push(`图${i + 1}（${caption}）：${credit}`);
    });
    return lines.join('\n');
  }
  if (legacyFooter) {
    const cleaned = sanitizeLegacyAudienceFooter(legacyFooter);
    if (cleaned) return cleaned;
  }
  return lines.join('\n');
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

/** 平台导出用短声明：只含面向读者的信息 */
export function buildCompactComplianceNote({ footer = '', images = [] } = {}) {
  const parts = ['内容含 AI 辅助生成'];
  const imgs = images || [];
  const hasAi = imgs.some(
    (i) => i?.sourceType === 'ai' || i?.sourceType === 'product' || /AI\s*生成/.test(String(i?.credit || ''))
  );
  const hasWeb = imgs.some(
    (i) => i?.sourceType === 'web' || /网络|检索/.test(String(i?.credit || ''))
  );
  if (hasAi) parts.push('配图为 AI 示意，非实拍');
  if (hasWeb) parts.push('配图来自网络检索');
  if (!hasAi && !hasWeb && footer) {
    if (/配图|网络/.test(footer)) parts.push('详见文末配图标注');
  }
  return `${parts.join('；')}。`;
}
