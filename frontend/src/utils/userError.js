/**
 * 前端展示用：把历史任务里可能残留的技术报错转成用户可读文案。
 */
export function toUserErrorMessage(errOrText, fallback = '生成失败，请稍后重试') {
  const raw = String(
    typeof errOrText === 'string'
      ? errOrText
      : errOrText?.message || errOrText || ''
  ).trim();

  if (!raw) return fallback;
  if (/部分完成|配图完成/.test(raw)) return raw;

  if (
    /^(生成失败|服务繁忙|请求过于频繁|处理超时|网络连接失败|服务暂时异常|配图生成失败|暂未找到合适配图|服务授权失败|服务额度不足|暂无权限|服务未配置|无法连接|请先|请粘贴|请选择)/.test(
      raw
    ) &&
    !looksTechnical(raw)
  ) {
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }

  const lower = raw.toLowerCase();
  if (/service\s*unavailable|service\s*busy|server\s*busy|503|overloaded/i.test(raw)) {
    return '服务繁忙，请稍后再试';
  }
  if (/429|rate\s*limit|too\s*many/.test(lower)) return '请求过于频繁，请稍后再试';
  if (/401|unauthorized|api\s*key/.test(lower)) return '服务授权失败，请联系管理员';
  if (/402|quota|余额|billing/.test(lower)) return '服务额度不足，请稍后再试';
  if (/timeout|超时|504|408/.test(lower)) return '处理超时，请稍后点「重新提交」再试';
  if (/econn|enotfound|fetch failed|network|连接/.test(lower)) {
    return '网络连接失败，请检查网络后重试';
  }
  if (/搜图|未找到合适/.test(raw)) return '暂未找到合适配图，请换个主题或稍后再试';
  if (/配图/.test(raw) && /失败|fail|busy|error/i.test(raw)) {
    return '配图生成失败，请稍后重试';
  }
  if (looksTechnical(raw)) return fallback;
  if (/^[\u4e00-\u9fff\d\s，。！？、：；“”‘’（）\-—…]+$/.test(raw) && raw.length <= 80) {
    return raw;
  }
  return fallback;
}

function looksTechnical(raw) {
  return (
    /ServiceUnavailable|OpenAIException|Error code|Exception|req_[a-z0-9]+|\{['"]detail['"]|ECONN|ETIMEDOUT|TypeError|AI 调用失败|配图失败[：:].*[A-Za-z]{4,}|https?:\/\//i.test(
      raw
    )
  );
}
