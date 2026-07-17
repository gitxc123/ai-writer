/**
 * 从分镜生成结果中解析每个镜头的独立提示词，供一键复制。
 * 兼容「完整提示词 / 提示词 / 英文提示词」等常见标题。
 */
export function parseStoryboardShots(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  const shots = [];
  // 匹配 ### 镜头 1｜xxx 或 ### 镜头 1 或 ## 镜头 1
  const headingRe = /^#{2,3}\s*镜头\s*(\d+)\s*[｜|:\-—–]?\s*(.*)$/gm;
  const matches = [...text.matchAll(headingRe)];
  if (!matches.length) return [];

  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end).trim();
    const title = String(m[2] || '').trim() || `镜头 ${m[1]}`;
    const prompt = extractShotPrompt(block);
    if (!prompt) continue;
    shots.push({
      id: Number(m[1]) || i + 1,
      title,
      prompt,
      block
    });
  }
  return shots;
}

function extractShotPrompt(block) {
  const lines = String(block || '').split(/\r?\n/);
  const labelRe =
    /^\s*[-*•]?\s*(完整提示词|提示词|中文提示词|英文提示词|English\s*Prompt)\s*[：:]\s*(.*)$/i;

  for (let i = 0; i < lines.length; i += 1) {
    const hit = lines[i].match(labelRe);
    if (!hit) continue;
    const sameLine = String(hit[2] || '').trim();
    if (sameLine && !isMetaLine(sameLine)) {
      return unwrapPrompt(sameLine);
    }
    const collected = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (/^\s*#{2,3}\s/.test(line)) break;
      if (/^\s*[-*•]?\s*(对应原文|负面提示|参数建议|镜头景别|运镜)/.test(line)) {
        if (collected.length) break;
        continue;
      }
      if (!String(line).trim()) {
        if (collected.length) break;
        continue;
      }
      collected.push(line.replace(/^\s*[-*•]\s*/, '').trim());
    }
    if (collected.length) return unwrapPrompt(collected.join('\n'));
  }

  // 兜底：取第一段非元信息文本
  const fallback = lines
    .map((l) => l.trim())
    .filter((l) => l && !isMetaLine(l) && !/^\s*[-*•]?\s*(对应原文|负面提示|参数建议)/.test(l));
  return fallback.length ? unwrapPrompt(fallback.slice(0, 6).join('\n')) : '';
}

function isMetaLine(line) {
  return /^\s*[-*•]?\s*(对应原文|负面提示|参数建议|镜头序号|视频主题)/.test(line);
}

function unwrapPrompt(text) {
  return String(text || '')
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["「『]+|["」』]+$/g, '')
    .trim();
}
