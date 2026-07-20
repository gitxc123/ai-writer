/**
 * 跨端文本复制。H5 优先用浏览器 API，避免 uni.setClipboardData 在手机浏览器失败并弹出「未能复制到剪贴板」。
 */
export async function copyTextToClipboard(text) {
  const data = String(text ?? '');
  if (!data) {
    throw new Error('没有可复制的内容');
  }

  if (typeof document !== 'undefined') {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(data);
        return { ok: true, mode: 'clipboard' };
      } catch {
        // fall through：无权限 / 非安全上下文 / 异步后丢失用户手势
      }
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = data;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText =
        'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;z-index:-1;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, data.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return { ok: true, mode: 'execCommand' };
    } catch {
      // fall through
    }
  }

  return new Promise((resolve, reject) => {
    uni.setClipboardData({
      data,
      showToast: false,
      success: () => resolve({ ok: true, mode: 'uni' }),
      fail: (err) =>
        reject(new Error(err?.errMsg || '复制失败，请长按文本手动复制'))
    });
  });
}
