import { splitArticleOutput, buildCompactComplianceNote } from './articleOutput.js';
import { clampToutiaoTitle, TOUTIAO_TITLE_MAX } from './platformLimits.js';
import { copyTextToClipboard } from './clipboard.js';

const PLATFORM_MAP = {
  小红书创作: {
    id: 'xhs',
    name: '小红书',
    tip: '复制后粘贴到小红书发布页，图会按顺序插入，正文可直接用'
  },
  今日头条创作: {
    id: 'toutiao',
    name: '今日头条',
    tip: `复制后粘贴到头条号编辑器；标题已限制≤${TOUTIAO_TITLE_MAX}字。配图以内嵌图片复制，请用编辑器「粘贴」勿用纯文本`
  },
  公众号文案: {
    id: 'wechat',
    name: '微信公众号',
    tip: '复制后粘贴到公众号后台，建议用「粘贴并匹配样式」；配图已尽量内嵌'
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

/** 粘贴内嵌图体积上限，过大则回退为链接模式 */
const MAX_EMBED_HTML_CHARS = 7_000_000;

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

/** 粘贴用公网图链：仅允许 http(s) 与 /uploads/，拒绝 javascript: 等危险协议 */
export function safeExportImageUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/uploads/')) {
    const pathOnly = u.split('?')[0];
    // 禁止路径穿越式伪装
    if (pathOnly.includes('..') || pathOnly.includes('\\') || pathOnly.includes('\0')) return '';
    return u;
  }
  if (/^https?:\/\//i.test(u)) return u;
  return '';
}

/** 把 /uploads 相对路径补成可抓取的绝对地址 */
export function absolutizeExportImageUrl(raw, baseOrigin = '') {
  const safe = safeExportImageUrl(raw);
  if (!safe) return '';
  if (/^https?:\/\//i.test(safe)) return safe;
  const origin = String(baseOrigin || '').replace(/\/$/, '');
  if (safe.startsWith('/uploads/') && origin) return `${origin}${safe}`;
  return safe;
}

/**
 * 粘贴用图址：优先本站已签名 /uploads（可内嵌抓取），再退远程公网地址。
 */
function exportImageUrl(item, baseOrigin = '') {
  const local = absolutizeExportImageUrl(item?.url, baseOrigin);
  const remote = absolutizeExportImageUrl(item?.remoteUrl, baseOrigin);
  if (local && /^https?:\/\//i.test(local)) return local;
  if (remote && /^https?:\/\//i.test(remote)) return remote;
  if (local.startsWith('/uploads/')) return local;
  return local || remote || '';
}

function needsImageEmbed(platformId) {
  return platformId === 'toutiao' || platformId === 'wechat' || platformId === 'general';
}

function imageBlockHtml(item, idx, baseOrigin = '') {
  const src = exportImageUrl(item, baseOrigin);
  if (!src) return '';
  const notes = [];
  if (item.caption) notes.push(`图${idx + 1}：${escapeHtml(item.caption)}`);
  const isAi = item.sourceType === 'ai' || /AI\s*生成/.test(String(item.credit || ''));
  if (isAi) {
    notes.push(escapeHtml(item.credit || 'AI 生成配图，非现场真实照片'));
  } else if (item.credit) {
    notes.push(escapeHtml(item.credit));
  }
  const caption = notes.length
    ? `<p style="color:#888;font-size:13px;margin:6px 0 14px;">${notes.join(' · ')}</p>`
    : '';
  return `<p style="margin:16px 0;text-align:center;"><img src="${escapeHtml(src)}" alt="${escapeHtml(item.caption || `配图${idx + 1}`)}" style="max-width:100%;height:auto;border-radius:6px;" /></p>${caption}`;
}

function imageBlockText(item, idx, { includeUrl = true, baseOrigin = '' } = {}) {
  const parts = [`[图片${idx + 1}`];
  if (item.caption) parts.push(`（${item.caption}）`);
  const isAi = item.sourceType === 'ai' || /AI\s*生成/.test(String(item.credit || ''));
  if (isAi) parts.push(' · AI生成，非现场真实照片');
  parts.push(']');
  if (!includeUrl) return `\n${parts.join('')}\n`;
  const url = exportImageUrl(item, baseOrigin);
  return url ? `\n${parts.join('')}\n${url}\n` : `\n${parts.join('')}\n`;
}

/**
 * 按平台生成可直接粘贴的图文包。
 * @param {{ templateName?: string, output?: string, images?: any[], imageBaseOrigin?: string }} opts
 */
export function buildPlatformPack({ templateName, output, images = [], imageBaseOrigin = '' } = {}) {
  const platform = detectPlatform(templateName);
  const { body, footer } = splitArticleOutput(output || '');
  let { title, paras } = pickTitleAndBody(body);
  const imgs = (images || []).filter((i) => exportImageUrl(i, imageBaseOrigin));
  const showFooter = Boolean(footer) && platform.id !== 'xhs';
  const embedPlatform = needsImageEmbed(platform.id);
  // 头条/公众号：纯文本不带裸链，避免编辑器优先粘贴成「只有链接」
  const includeUrlInText = !embedPlatform;

  if (platform.id === 'toutiao') {
    title = clampToutiaoTitle(title);
  }

  const putImage = (item, idx) => ({
    html: imageBlockHtml(item, idx, imageBaseOrigin),
    text: imageBlockText(item, idx, { includeUrl: includeUrlInText, baseOrigin: imageBaseOrigin })
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
    // 标题 → 首图 → 段落穿插其余图
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
  } else if (platform.id === 'xhs') {
    const note = buildCompactComplianceNote({ footer, images: imgs });
    html += `<p style="color:#888;font-size:12px;margin-top:12px;line-height:1.5;">${escapeHtml(note)}</p>`;
    text += `\n${note}\n`;
  }

  return {
    platform,
    title,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;">${html}</div>`,
    text: text.trim(),
    imageCount: imgs.length,
    titleMax: platform.id === 'toutiao' ? TOUTIAO_TITLE_MAX : null,
    preferEmbedImages: embedPlatform && imgs.length > 0
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

export async function fetchImageAsDataUrl(src) {
  const url = String(src || '').trim();
  if (!url) throw new Error('空图片地址');
  if (url.startsWith('data:image/')) return url;
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
  if (!res.ok) throw new Error(`图片拉取失败 ${res.status}`);
  const blob = await res.blob();
  if (!blob || blob.size < 32) throw new Error('图片为空');
  return blobToDataUrl(blob);
}

/**
 * 将 HTML 中的 img src 拉成本地 data URL，便于头条/公众号粘贴后显示图片。
 */
export async function embedHtmlImagesAsDataUrls(html, { maxChars = MAX_EMBED_HTML_CHARS } = {}) {
  if (typeof document === 'undefined') {
    return { html, embedded: 0, failed: 0, tooLarge: false };
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const imgs = [...wrap.querySelectorAll('img[src]')];
  let embedded = 0;
  let failed = 0;

  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src) {
      failed += 1;
      continue;
    }
    if (src.startsWith('data:image/')) {
      embedded += 1;
      continue;
    }
    try {
      const dataUrl = await fetchImageAsDataUrl(src);
      img.setAttribute('src', dataUrl);
      embedded += 1;
    } catch {
      failed += 1;
    }
  }

  const out = wrap.innerHTML;
  if (out.length > maxChars) {
    return { html, embedded: 0, failed: imgs.length, tooLarge: true };
  }
  return { html: out, embedded, failed, tooLarge: false };
}

function copyHtmlSelectionSync(root) {
  if (!root || typeof document === 'undefined') return false;
  try {
    root.focus?.();
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    return Boolean(ok);
  } catch {
    return false;
  }
}

/** 同步复制 HTML（无 await），用于仍持有用户手势时 */
function copyHtmlViaDomSync(html) {
  const box = document.createElement('div');
  box.setAttribute('contenteditable', 'true');
  box.innerHTML = html;
  box.style.cssText =
    'position:fixed;left:0;top:0;width:640px;max-height:480px;opacity:0.01;pointer-events:none;z-index:-1;overflow:hidden;';
  document.body.appendChild(box);
  try {
    return copyHtmlSelectionSync(box);
  } finally {
    box.remove();
  }
}

async function tryClipboardItemWrite(html, text) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 自动复制失败时（常见于手机微信）：弹出预览，让用户再点一次「复制图文」，重新获得手势。
 */
function copyHtmlViaConfirmSheet({ html, text, embedded = 0, embedFailed = 0 }) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('当前环境无法复制图文'));
      return;
    }

    const existing = document.getElementById('aiw-rich-copy');
    if (existing) existing.remove();

    const mask = document.createElement('div');
    mask.id = 'aiw-rich-copy';
    mask.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'width:100%;max-width:640px;max-height:82vh;background:#fff;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;display:flex;flex-direction:column;gap:10px;';

    const title = document.createElement('div');
    title.textContent =
      embedded > 0 ? `配图已内嵌 ${embedded} 张，请再点一次完成复制` : '请再点一次复制图文';
    title.style.cssText = 'font-size:16px;font-weight:700;color:#1a1a1a;';

    const tip = document.createElement('div');
    tip.textContent =
      '手机浏览器需在弹出层内再次点击，才能把图片写入剪贴板。粘贴到头条/公众号请用「粘贴」，不要用纯文本。';
    tip.style.cssText = 'font-size:12px;color:#909399;line-height:1.5;';

    const preview = document.createElement('div');
    preview.setAttribute('contenteditable', 'true');
    preview.innerHTML = html;
    preview.style.cssText =
      'flex:1;min-height:180px;max-height:46vh;overflow:auto;border:1px solid #e4e7ed;border-radius:10px;padding:12px;font-size:14px;line-height:1.7;-webkit-user-select:text;user-select:text;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;';

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.textContent = embedded > 0 ? '复制图文到剪贴板' : '复制内容';
    btnCopy.style.cssText =
      'flex:1;height:44px;border:none;border-radius:22px;background:#0a84ff;color:#fff;font-size:16px;font-weight:600;';

    const btnText = document.createElement('button');
    btnText.type = 'button';
    btnText.textContent = '仅文案';
    btnText.style.cssText =
      'width:88px;height:44px;border:1px solid #dcdfe6;border-radius:22px;background:#fff;color:#606266;font-size:14px;';

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = '取消';
    btnClose.style.cssText =
      'width:72px;height:44px;border:none;border-radius:22px;background:#f2f3f5;color:#606266;font-size:14px;';

    const cleanup = () => mask.remove();

    btnCopy.onclick = async () => {
      // 二次点击：重新获得用户手势，此时同步复制内嵌图可成功
      let ok = copyHtmlSelectionSync(preview);
      if (!ok) ok = copyHtmlViaDomSync(html);
      if (!ok) ok = await tryClipboardItemWrite(html, text);
      if (ok) {
        cleanup();
        resolve({
          ok: true,
          mode: embedded > 0 ? 'html-embed' : 'html',
          embedded,
          embedFailed
        });
        return;
      }
      tip.textContent = '仍未写入剪贴板：可在上方预览区长按全选后复制，或点「仅文案」。';
      tip.style.color = '#fa3534';
    };

    btnText.onclick = async () => {
      try {
        await copyTextToClipboard(text);
        cleanup();
        resolve({ ok: true, mode: 'text', embedded: 0, embedFailed: embedFailed || 0 });
      } catch (e) {
        tip.textContent = e.message || '文案复制失败';
        tip.style.color = '#fa3534';
      }
    };

    btnClose.onclick = () => {
      cleanup();
      reject(new Error('已取消复制'));
    };

    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        cleanup();
        reject(new Error('已取消复制'));
      }
    });

    btnRow.appendChild(btnCopy);
    btnRow.appendChild(btnText);
    btnRow.appendChild(btnClose);
    sheet.appendChild(title);
    sheet.appendChild(tip);
    sheet.appendChild(preview);
    sheet.appendChild(btnRow);
    mask.appendChild(sheet);
    document.body.appendChild(mask);

    // 预选中，部分机型可直接 Cmd/Ctrl+C
    setTimeout(() => {
      copyHtmlSelectionSync(preview);
    }, 80);
  });
}

/**
 * 一键复制图文：头条/公众号优先内嵌图片二进制；手机端自动复制失败时弹出二次确认。
 */
export async function copyPlatformPack(pack) {
  let { html, text } = pack;
  let embedMeta = { embedded: 0, failed: 0, tooLarge: false };

  if (pack.preferEmbedImages && typeof document !== 'undefined') {
    try {
      const meta = await embedHtmlImagesAsDataUrls(html);
      if (!meta.tooLarge && meta.embedded > 0) {
        html = meta.html;
        embedMeta = meta;
      } else {
        embedMeta = { embedded: 0, failed: meta.failed || pack.imageCount || 0, tooLarge: Boolean(meta.tooLarge) };
      }
    } catch {
      embedMeta = { embedded: 0, failed: pack.imageCount || 0, tooLarge: false };
    }
  }

  const embedded = embedMeta.embedded || 0;
  const embedFailed = embedMeta.failed || 0;
  const embeddedOk = embedded > 0;

  // 桌面端：异步后 ClipboardItem / 选区复制仍可能成功
  if (await tryClipboardItemWrite(html, text)) {
    return {
      ok: true,
      mode: embeddedOk ? 'rich-embed' : 'rich',
      embedded,
      embedFailed
    };
  }
  if (copyHtmlViaDomSync(html)) {
    return {
      ok: true,
      mode: embeddedOk ? 'html-embed' : 'html',
      embedded,
      embedFailed
    };
  }

  // 手机微信等：必须二次点击才能带上内嵌图
  if (pack.preferEmbedImages && typeof document !== 'undefined') {
    return copyHtmlViaConfirmSheet({
      html,
      text,
      embedded,
      embedFailed: embedFailed || pack.imageCount || 0
    });
  }

  await copyTextToClipboard(text);
  return { ok: true, mode: 'text', embedded: 0, embedFailed: pack.imageCount || 0 };
}
