/**
 * 把原始异常整理成给用户看的短提示；日志仍应打印原始 err。
 */
export function toUserErrorMessage(errOrText, fallback = '生成失败，请稍后重试') {
  const status =
    typeof errOrText === 'object' && errOrText
      ? errOrText.status || errOrText.response?.status
      : undefined;
  const raw = String(
    typeof errOrText === 'string'
      ? errOrText
      : errOrText?.error?.message || errOrText?.message || ''
  ).trim();

  if (!raw) return fallback;

  // 已是友好文案：部分成功备注、明确中文业务提示
  if (/部分完成|配图完成/.test(raw)) return raw;
  if (isAlreadyFriendly(raw)) return clamp(raw, 120);

  const lower = raw.toLowerCase();

  if (
    status === 503 ||
    /service\s*unavailable|service\s*busy|server\s*busy|overloaded|capacity/i.test(raw)
  ) {
    return '服务繁忙，请稍后再试';
  }
  if (status === 429 || /rate\s*limit|too\s*many\s*requests|请求过于频繁/.test(lower)) {
    return '请求过于频繁，请稍后再试';
  }
  if (status === 401 || /unauthorized|invalid\s*api\s*key|api\s*key\s*无效/.test(lower)) {
    return '服务授权失败，请联系管理员检查配置';
  }
  if (status === 402 || /insufficient|balance|余额不足|quota|billing/.test(lower)) {
    return '服务额度不足，请稍后再试或联系管理员';
  }
  if (status === 403 || /forbidden|permission/.test(lower)) {
    return '暂无权限完成此操作';
  }
  if (status === 408 || status === 504 || /timeout|timed\s*out|etimedout|aborted|超时/.test(lower)) {
    return '处理超时，请稍后点「重新提交」再试';
  }
  if (
    status === 500 ||
    status === 502 ||
    /internal\s*server|bad\s*gateway|openaiexception|apierror|typeerror|referenceerror/.test(
      lower
    )
  ) {
    return '服务暂时异常，请稍后重试';
  }
  if (
    /econnrefused|enotfound|econnreset|fetch failed|network|socket|connection/.test(lower)
  ) {
    return '网络连接失败，请检查网络后重试';
  }
  if (/missing api key|请配置/.test(lower)) {
    return '服务未配置完成，请联系管理员';
  }
  if (/搜图|未找到合适图片|pexels/.test(lower)) {
    return '暂未找到合适配图，请换个主题或稍后再试';
  }
  if (/配图|agnes-image|image/.test(lower) && /fail|失败|error|busy|503/.test(lower)) {
    return '配图生成失败，请稍后重试';
  }

  // 含英文异常名 / JSON / Error code 等技术报文 → 统一兜底
  if (looksTechnical(raw)) {
    return fallback;
  }

  // 纯中文短句可展示
  if (/^[\u4e00-\u9fff\d\s，。！？、：；“”‘’（）\-—…]+$/.test(raw) && raw.length <= 80) {
    return raw;
  }

  return fallback;
}

function isAlreadyFriendly(raw) {
  return (
    /^(生成失败|服务繁忙|请求过于频繁|处理超时|网络连接失败|服务暂时异常|配图生成失败|暂未找到合适配图|服务授权失败|服务额度不足|暂无权限|服务未配置|演示模式|Ollama|无法连接|请先|请粘贴|请选择)/.test(
      raw
    ) && !looksTechnical(raw)
  );
}

function looksTechnical(raw) {
  return (
    /ServiceUnavailable|OpenAIException|Error code|Traceback|Exception|stack|req_[a-z0-9]+|\{['"]detail['"]|ECONN|ETIMEDOUT|ENOTFOUND|TypeError|at\s+\S+\s*\(|https?:\/\//i.test(
      raw
    ) ||
    /AI 调用失败[：:]/.test(raw) ||
    /配图失败[：:].*[A-Za-z]{4,}/.test(raw)
  );
}

function clamp(text, max) {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
