import { splitArticleOutput } from './articleOutput.js';
import { clampToutiaoTitle, TOUTIAO_TITLE_MAX } from './platformLimits.js';

const PLATFORM_MAP = {
  小红书创作: {
    id: 'xhs',
    name: '小红书',
    tip: '复制后粘贴到小红书发布页，图会按顺序插入，正文可直接用'
  },
  今日头条创作: {
    id: 'toutiao',
    name: '今日头条',
    tip: `复制后粘贴到头条号编辑器；标题已限制≤${TOUTIAO_TITLE_MAX}字，配图按图片链接插入`
  },
  公众号文案: {
    id: 'wechat',
    name: '微信公众号',
    tip: '复制后粘贴到公众号后台，建议用「粘贴并匹配样式」'
  },
  抖音文案: {
    id: 'douyin',
    name: '抖音',
    tip: '复制后粘贴到抖音文案栏；封面图请手动上传配图'
  },
  产品介绍: {
    id: 'general',
    name: '通用发布',
    tip: '复制后可粘贴到电商详情或宣传页'
  },
  一键改文: {
    id: 'general',
    name: '改写稿',
    tip: '复制后可直接用于发布'
  },
  故事分镜提示词: {
    id: 'storyboard',
    name: '分镜提示词',
    tip: '复制各镜「完整提示词」到所选 AI 平台即可单独生成片段'
  }
};

export function detectPlatform(templateName = '') {
  return (
    PLATFORM_MAP[templateName] || {
      id: 'general',
      name: '目标平台',
      tip: '复制后粘贴到对应平台编辑器即可'
    }
  );
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitParagraphs(body = '') {
  return String(body)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function pickTitleAndBody(body = '') {
  const lines = splitParagraphs(body);
  if (!lines.length) return { title: '', paras: [] };

  let title = '';
  let rest = lines;
  const first = lines[0];
  if (/^(【标题】|标题[:：]|#\s*)/.test(first) || first.length <= 40) {
    title = first.replace(/^(【标题】|标题[:：]|#\s*)/, '').trim();
    rest = lines.slice(1);
  }
  return { title, paras: rest };
}

/** 粘贴用公网图链：优先原始远程地址，避免 /uploads 本机路径 */
function exportImageUrl(item) {
  const remote = item?.remoteUrl;
  if (remote && /^https?:\/\//i.test(remote)) return remote;
  const url = item?.url || '';
  return url;
}

function imageBlockHtml(item, idx) {
  const src = exportImageUrl(item);
  const caption = item.caption
    ? `<p style="color:#888;font-size:13px;margin:6px 0 14px;">图${idx + 1}：${escapeHtml(item.caption)}</p>`
    : '';
  return `<p style="margin:16px 0;text-align:center;"><img src="${src}" alt="${escapeHtml(item.caption || `配图${idx + 1}`)}" style="max-width:100%;height:auto;border-radius:6px;" /></p>${caption}`;
}

function imageBlockText(item, idx) {
  const cap = item.caption ? `（${item.caption}）` : '';
  return `\n[图片${idx + 1}${cap}]\n${exportImageUrl(item)}\n`;
}

/**
 * 按平台生成可直接粘贴的图文包（图片链接模式）
 */
export function buildPlatformPack({ templateName, output, images = [] }) {
  const platform = detectPlatform(templateName);
  const { body, footer } = splitArticleOutput(output || '');
  let { title, paras } = pickTitleAndBody(body);
  const imgs = (images || []).filter((i) => exportImageUrl(i));
  const showFooter = platform.id !== 'xhs' && footer;

  if (platform.id === 'toutiao') {
    title = clampToutiaoTitle(title);
  }

  const putImage = (item, idx) => ({
    html: imageBlockHtml(item, idx),
    text: imageBlockText(item, idx)
  });

  let html = '';
  let text = '';

  if (platform.id === 'xhs') {
    imgs.forEach((img, i) => {
      const block = putImage(img, i);
      html += block.html;
      text += block.text;
    });
    if (title) {
      html += `<p style="font-size:18px;font-weight:700;margin:12px 0;">${escapeHtml(title)}</p>`;
      text += `${title}\n\n`;
    }
    paras.forEach((p) => {
      html += `<p style="font-size:15px;line-height:1.8;margin:8px 0;">${escapeHtml(p)}</p>`;
      text += `${p}\n`;
    });
  } else if (platform.id === 'toutiao' || platform.id === 'wechat' || platform.id === 'general') {
    // 标题 → 首图链接 → 段落穿插其余图链接
    if (title) {
      html += `<h2 style="font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.4;">${escapeHtml(title)}</h2>`;
      text += `${title}\n\n`;
    }
    if (imgs[0]) {
      const block = putImage(imgs[0], 0);
      html += block.html;
      text += block.text;
    }

    const restImgs = imgs.slice(1);
    const slot = Math.max(1, Math.ceil(paras.length / (restImgs.length + 1)));
    let imgPtr = 0;
    paras.forEach((p, i) => {
      html += `<p style="font-size:16px;line-height:1.9;margin:12px 0;color:#222;">${escapeHtml(p)}</p>`;
      text += `${p}\n\n`;
      if (restImgs.length && (i + 1) % slot === 0 && imgPtr < restImgs.length) {
        const block = putImage(restImgs[imgPtr], imgPtr + 1);
        html += block.html;
        text += block.text;
        imgPtr += 1;
      }
    });
    while (imgPtr < restImgs.length) {
      const block = putImage(restImgs[imgPtr], imgPtr + 1);
      html += block.html;
      text += block.text;
      imgPtr += 1;
    }
  } else if (platform.id === 'douyin') {
    if (title) {
      html += `<p style="font-size:17px;font-weight:700;">${escapeHtml(title)}</p>`;
      text += `${title}\n\n`;
    }
    paras.forEach((p) => {
      html += `<p style="font-size:15px;line-height:1.7;margin:8px 0;">${escapeHtml(p)}</p>`;
      text += `${p}\n`;
    });
    if (imgs.length) {
      html += `<p style="color:#888;font-size:13px;margin-top:12px;">封面参考图：</p>`;
      text += `\n【封面参考图】\n`;
      imgs.forEach((img, i) => {
        const block = putImage(img, i);
        html += block.html;
        text += block.text;
      });
    }
  }

  if (showFooter) {
    const footerParas = splitParagraphs(footer);
    html += `<hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />`;
    text += `\n---\n`;
    footerParas.forEach((p) => {
      html += `<p style="font-size:12px;color:#999;line-height:1.6;margin:4px 0;">${escapeHtml(p)}</p>`;
      text += `${p}\n`;
    });
  }

  return {
    platform,
    title,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">${html}</div>`,
    text: text.trim(),
    imageCount: imgs.length,
    titleMax: platform.id === 'toutiao' ? TOUTIAO_TITLE_MAX : null
  };
}

/**
 * 一键复制图文：优先富文本 HTML（含图片链接），兼容纯文本
 */
export async function copyPlatformPack(pack) {
  const { html, text } = pack;

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      return { ok: true, mode: 'rich' };
    } catch {
      // fall through
    }
  }

  try {
    const box = document.createElement('div');
    box.innerHTML = html;
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(box);
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    document.body.removeChild(box);
    if (ok) return { ok: true, mode: 'html' };
  } catch {
    // fall through
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return { ok: true, mode: 'text' };
  }

  return new Promise((resolve, reject) => {
    uni.setClipboardData({
      data: text,
      success: () => resolve({ ok: true, mode: 'text' }),
      fail: (err) => reject(err)
    });
  });
}
