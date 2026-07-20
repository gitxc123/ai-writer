/**
 * 跨端文本复制。
 * 关键点：必须在用户点击的同步调用栈里先走 execCommand；
 * 先 await clipboard API 会丢掉手势，导致 iOS/微信里后续复制全部失败。
 */

function tryExecCommandCopy(data) {
  if (typeof document === 'undefined') return false;

  const ta = document.createElement('textarea');
  ta.value = data;
  ta.setAttribute('readonly', 'readonly');
  ta.setAttribute('inputmode', 'none');
  // 不可 display:none / 移出太远，部分 WebView 会判定未选中
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;z-index:-1;';
  document.body.appendChild(ta);

  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, data.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    ta.remove();
  }

  if (ok) return true;

  // iOS / 部分安卓：用选区复制
  const span = document.createElement('span');
  span.textContent = data;
  span.style.cssText =
    'position:fixed;top:0;left:0;opacity:0;white-space:pre-wrap;z-index:-1;';
  document.body.appendChild(span);
  try {
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand('copy');
    sel.removeAllRanges();
  } catch {
    ok = false;
  } finally {
    span.remove();
  }
  return ok;
}

function uniSetClipboard(data) {
  return new Promise((resolve, reject) => {
    uni.setClipboardData({
      data,
      showToast: false,
      success: () => resolve(true),
      fail: (err) => reject(err || new Error('uni clipboard fail'))
    });
  });
}

/**
 * 剪贴板 API 全失败时：弹出可选中文本，引导用户长按复制。
 */
function showManualCopySheet(data) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      uni.showModal({
        title: '请手动复制',
        content: data.length > 500 ? `${data.slice(0, 500)}…` : data,
        showCancel: false,
        confirmText: '知道了',
        success: () => resolve({ ok: true, mode: 'manual' })
      });
      return;
    }

    const existing = document.getElementById('aiw-manual-copy');
    if (existing) existing.remove();

    const mask = document.createElement('div');
    mask.id = 'aiw-manual-copy';
    mask.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:0;';

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'width:100%;max-width:640px;max-height:70vh;background:#fff;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('div');
    title.textContent = '自动复制失败，请长按下方文字复制';
    title.style.cssText = 'font-size:15px;font-weight:600;color:#1a1a1a;';

    const ta = document.createElement('textarea');
    ta.value = data;
    ta.readOnly = true;
    ta.style.cssText =
      'width:100%;height:40vh;font-size:14px;line-height:1.5;padding:12px;border:1px solid #e4e7ed;border-radius:8px;box-sizing:border-box;resize:none;color:#303133;-webkit-user-select:text;user-select:text;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '关闭';
    btn.style.cssText =
      'width:100%;height:44px;border:none;border-radius:22px;background:#0a84ff;color:#fff;font-size:16px;';

    const close = () => {
      mask.remove();
      resolve({ ok: true, mode: 'manual' });
    };
    btn.onclick = close;
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close();
    });

    sheet.appendChild(title);
    sheet.appendChild(ta);
    sheet.appendChild(btn);
    mask.appendChild(sheet);
    document.body.appendChild(mask);

    // 尽量预选中，方便一键复制
    setTimeout(() => {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, data.length);
    }, 50);
  });
}

/**
 * @param {string} text
 * @param {{ manualFallback?: boolean }} [options]
 */
export async function copyTextToClipboard(text, options = {}) {
  const { manualFallback = true } = options;
  const data = String(text ?? '');
  if (!data) {
    throw new Error('没有可复制的内容');
  }

  // 1) 同步 execCommand —— 必须最先、且不能先 await
  if (tryExecCommandCopy(data)) {
    return { ok: true, mode: 'execCommand' };
  }

  // 2) 现代 Clipboard API（需 HTTPS + 手势；部分环境仍可用）
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(data);
      return { ok: true, mode: 'clipboard' };
    } catch {
      // fall through
    }
  }

  // 3) uni 封装（内部仍可能失败，关闭自带 toast）
  try {
    await uniSetClipboard(data);
    return { ok: true, mode: 'uni' };
  } catch {
    // fall through
  }

  // 4) 手动复制兜底（不抛错，避免只看到失败提示）
  if (manualFallback) {
    return showManualCopySheet(data);
  }

  throw new Error('复制失败，请长按文本手动复制');
}
