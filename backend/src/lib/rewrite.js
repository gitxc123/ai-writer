import { generateText, getMode } from './ai.js';

export const REWRITE_TEMPLATE_NAME = '一键改文';
export const MAX_SOURCE_CHARS = 12000;
export const TARGET_SIMILARITY = 0.3;
export const MAX_SHARED_RUN = 24; // 连续相同字符上限，避免大片抄袭
export const MAX_REWRITE_ATTEMPTS = 3;

export function isRewriteTemplate(name) {
  return name === REWRITE_TEMPLATE_NAME;
}

/** 压缩空白，便于比对 */
export function normalizeForCompare(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：""''（）【】《》\.,!?;:'"()\-—…·]/g, '')
    .toLowerCase();
}

export function charNgrams(text, n = 3) {
  const s = normalizeForCompare(text);
  const grams = new Set();
  if (s.length < n) {
    if (s) grams.add(s);
    return grams;
  }
  for (let i = 0; i <= s.length - n; i += 1) {
    grams.add(s.slice(i, i + n));
  }
  return grams;
}

/** Jaccard 相似度（字符 n-gram），0~1 */
export function ngramSimilarity(a, b, n = 3) {
  const A = charNgrams(a, n);
  const B = charNgrams(b, n);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) {
    if (B.has(g)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/** 最长公共子串长度（规范化后） */
export function longestCommonRun(a, b) {
  const s = normalizeForCompare(a);
  const t = normalizeForCompare(b);
  if (!s || !t) return 0;
  const m = s.length;
  const n = t.length;
  // 滚动一维 DP，省内存
  let prev = new Array(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i += 1) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j += 1) {
      if (s[i - 1] === t[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

export function splitSentences(text) {
  return String(text || '')
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/** 源文句子是否大段落进改写稿 */
export function findCopiedSentences(source, rewritten, { minLen = 12 } = {}) {
  const hits = [];
  const dest = normalizeForCompare(rewritten);
  for (const sent of splitSentences(source)) {
    const norm = normalizeForCompare(sent);
    if (norm.length < minLen) continue;
    if (dest.includes(norm)) {
      hits.push(sent);
      continue;
    }
    // 滑动窗口：改写稿中是否存在与该句高度重合的片段
    const window = Math.max(norm.length, minLen);
    let copied = false;
    for (let i = 0; i <= Math.max(0, dest.length - window); i += Math.max(1, Math.floor(window / 4))) {
      const slice = dest.slice(i, i + window);
      if (ngramSimilarity(norm, slice, 3) >= 0.82) {
        copied = true;
        break;
      }
    }
    if (copied) hits.push(sent);
  }
  return hits;
}

export function evaluateRewrite(source, rewritten) {
  const similarity = ngramSimilarity(source, rewritten, 3);
  const sharedRun = longestCommonRun(source, rewritten);
  const copied = findCopiedSentences(source, rewritten);
  const pass =
    similarity < TARGET_SIMILARITY && sharedRun < MAX_SHARED_RUN && copied.length === 0;
  return { similarity, sharedRun, copiedCount: copied.length, copied, pass };
}

function mockRewrite(source, style) {
  const brief = String(source || '').replace(/\s+/g, ' ').slice(0, 80);
  return `【改写版】

换个角度看这件事：${brief || '原文要点'}……

核心观点重新组织后：先讲背景，再讲做法，最后给可执行建议。语气调整为「${style || '清晰好读'}」，避免沿用原文句式。

1. 用新的生活化例子说明问题
2. 给出与原文不同的表述结构和动词选择
3. 结尾换成行动号召，而不是照抄原收束句

（演示模式改写，未调用真实模型）`;
}

/**
 * 第一步：提炼原文要点（提纲，不照抄长句）
 */
export async function extractArticleBrief(source, { style } = {}) {
  if (getMode() === 'mock') {
    return `要点：${String(source || '').slice(0, 120)}…；风格倾向：${style || '通用'}`;
  }
  const prompt = [
    '你是资深编辑。请阅读用户原文，只提取信息骨架，不要复述原文长句。',
    '输出纯文本提纲，包含：',
    '1) 主题（一句话）',
    '2) 关键事实/论据（条目，改写表述，禁止原句）',
    '3) 核心观点/结论',
    '4) 适合保留的专有名词（人名、品牌、数据）',
    '禁止大段摘抄原文。',
    '',
    `期望文风提示：${style || '清晰好读'}`,
    '',
    '【原文】',
    String(source || '').slice(0, MAX_SOURCE_CHARS)
  ].join('\n');
  return generateText(prompt, {});
}

/**
 * 第二步：据提纲重写全文
 */
export async function rewriteFromBrief(brief, source, { style, length, attempt = 1 } = {}) {
  if (getMode() === 'mock') {
    return mockRewrite(source, style);
  }
  const extra =
    attempt > 1
      ? [
          `这是第 ${attempt} 次重写。上次与原文仍然过像。`,
          '必须更换段落结构、句子主干、比喻与例证；禁止保留连续 15 字以上相同片段。',
          '同义词替换不够，需要整段换说法。'
        ].join('\n')
      : '';

  const prompt = [
    '你是中文改写专家。根据「内容提纲」重写一篇全新文章，面向自媒体发布。',
    '硬性要求：',
    '1) 保留关键事实、人名、品牌、数据与结论，不编造原文没有的事实',
    '2) 表达方式必须全新：换结构、换句式、换例证表述；相似度要明显低于原文',
    '3) 禁止连续照抄原文 10 字以上；禁止整句挪用',
    '4) 输出完整可读成稿（可含标题），不要解释过程',
    style ? `文风：${style}` : '文风：清晰、好读、有节奏',
    length ? `篇幅约 ${length} 字（可略浮动）` : '篇幅与原文接近',
    extra,
    '',
    '【内容提纲】',
    String(brief || ''),
    '',
    '【原文（仅供核对事实，禁止照抄）】',
    String(source || '').slice(0, Math.min(6000, MAX_SOURCE_CHARS))
  ].join('\n');

  return generateText(prompt, {});
}

/**
 * 完整改写流水线：提炼 → 重写 → 相似度检测 → 不达标则再写
 */
export async function rewriteArticlePipeline({
  source,
  style = '',
  length = '',
  onProgress
} = {}) {
  const article = String(source || '').trim();
  if (article.length < 50) {
    throw new Error('原文太短，请至少粘贴 50 字以上');
  }
  if (article.length > MAX_SOURCE_CHARS) {
    throw new Error(`原文过长，请控制在 ${MAX_SOURCE_CHARS} 字以内`);
  }

  onProgress?.('正在提炼原文要点…');
  const brief = await extractArticleBrief(article, { style });

  let best = null;
  let lastEval = null;
  for (let attempt = 1; attempt <= MAX_REWRITE_ATTEMPTS; attempt += 1) {
    onProgress?.(`正在改写（第 ${attempt}/${MAX_REWRITE_ATTEMPTS} 次）…`);
    const rewritten = await rewriteFromBrief(brief, article, { style, length, attempt });
    const evaluation = evaluateRewrite(article, rewritten);
    lastEval = evaluation;
    console.log(
      '[rewrite]',
      `attempt=${attempt}`,
      `sim=${evaluation.similarity.toFixed(3)}`,
      `run=${evaluation.sharedRun}`,
      `copied=${evaluation.copiedCount}`,
      `pass=${evaluation.pass}`
    );
    if (!best || evaluation.similarity < best.evaluation.similarity) {
      best = { text: rewritten, evaluation, attempt };
    }
    if (evaluation.pass) {
      return {
        output: formatRewriteOutput(rewritten, evaluation),
        evaluation,
        attempt,
        brief
      };
    }
  }

  // 仍未达标：返回最优稿（检测细节仅写日志/任务备注，不塞进正文给用户看）
  return {
    output: formatRewriteOutput(best.text, best.evaluation),
    evaluation: best.evaluation,
    attempt: best.attempt,
    brief,
    softPass: true
  };
}

function formatRewriteOutput(text, evaluation) {
  return String(text || '').trim();
}
