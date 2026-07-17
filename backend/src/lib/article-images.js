import { chatCompletions, getMode } from './ai.js';
import { getTodayLabel } from './news-guard.js';
import { toUserErrorMessage } from './user-error.js';

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search';

const TOPIC_KINDS = {
  SPORTS: 'sports',
  POLITICS: 'politics',
  LIFESTYLE: 'lifestyle',
  GENERAL: 'general'
};

function detectTopicKind(text = '') {
  const t = String(text);
  if (/世界杯|赛事|比赛|淘汰|进球|传球|哈兰德|足球|篮球|奥运|球员|教练/.test(t)) {
    return TOPIC_KINDS.SPORTS;
  }
  if (/双开|通报|纪委|受贿|落马|立案|法院|判决|官员|反腐|查处|违纪|开除/.test(t)) {
    return TOPIC_KINDS.POLITICS;
  }
  if (/种草|探店|穿搭|护肤|美食|旅行|情感|恋爱|职场成长/.test(t)) {
    return TOPIC_KINDS.LIFESTYLE;
  }
  return TOPIC_KINDS.GENERAL;
}

function parseJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function stripHistoricalYearBias(query) {
  return String(query || '')
    .replace(/\b(19\d{2}|20[0-1]\d)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const EVENT_TAIL_RE =
  /(患癌|确诊|病逝|去世|逝世|结婚|离婚|分手|复合|代言|演唱会|发布会|道歉|出轨|怀孕|生子|落马|双开|被抓|被查|通报|起诉|胜诉|败诉|获奖|夺冠|退役|复出|官宣|出道|退圈|塌房|翻车|爆料|回应|发声|被曝|传出)+$/g;

/**
 * 从主题里抽出主体（人名/品牌等），避免搜图只剩「患癌」「医院」这类泛词。
 * 例：曲婉婷患癌 → 曲婉婷
 */
export function extractCoreSubjects(keyword = '') {
  const k = String(keyword || '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!k) return [];

  const subjects = new Set([k]);
  let core = k.replace(EVENT_TAIL_RE, '').replace(/^(关于|最新|突发|重磅|独家|突发消息)/, '').trim();
  if (core.length >= 2) subjects.add(core);

  const cnName = k.match(/^[\u4e00-\u9fa5]{2,4}/);
  if (cnName) subjects.add(cnName[0]);

  // 英文专名（Wanting Qu 等）
  const en = k.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/);
  if (en) subjects.add(en[0]);

  return [...subjects].sort((a, b) => b.length - a.length);
}

/** 保证搜词里至少带上主题主体，防止 AI 规划成「癌症医院」这类无关词 */
export function ensureQueryHasSubject(query, keyword = '') {
  const q = String(query || '').trim();
  const subjects = extractCoreSubjects(keyword);
  if (!subjects.length) return q || String(keyword || '').trim();

  const hay = q.toLowerCase();
  const hit = subjects.some((s) => hay.includes(String(s).toLowerCase()));
  if (hit) return q;

  const primary = subjects.find((s) => s !== keyword) || subjects[0];
  return `${primary} ${q || '新闻 资料图'}`.trim();
}

function extractTopicTokens(text = '') {
  const raw = String(text)
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const stop = new Set([
    '这个',
    '一个',
    '我们',
    '他们',
    '以及',
    '进行',
    '相关',
    '内容',
    '文章',
    '关于',
    '今日',
    '最新',
    '报道',
    '患癌',
    '确诊',
    '医院',
    '患者',
    '新闻',
    '图片',
    '资料',
    '现场'
  ]);
  const fromSpaces = raw.filter((s) => !stop.has(s));
  const fromSubjects = extractCoreSubjects(text);
  return [...new Set([...fromSubjects, ...fromSpaces])].slice(0, 16);
}

/**
 * 有明确主体时：优先只保留标题/来源含主体的图；没有命中才退回原列表。
 */
export function pickRelevantWebImages(candidates = [], { keyword = '', limit = 1 } = {}) {
  const subjects = extractCoreSubjects(keyword).filter((s) => s.length >= 2 && s !== keyword);
  // 也把完整 keyword 算进去（短主题时）
  const keys = [...new Set([...subjects, ...extractCoreSubjects(keyword)])].filter(
    (s) => s && s.length >= 2
  );
  if (!keys.length) return candidates.slice(0, Math.max(1, limit));

  const matched = candidates.filter((p) => {
    const alt = `${p.alt || ''} ${p.credit || ''} ${p.sourceUrl || ''}`.toLowerCase();
    return keys.some((s) => alt.includes(String(s).toLowerCase()));
  });

  const pool = matched.length ? matched : candidates;
  return pool.slice(0, Math.max(1, limit));
}

function buildSearchQueries({ keyword, caption, kind, index }) {
  const subjects = extractCoreSubjects(keyword);
  const primary = subjects.find((s) => s !== keyword) || keyword || '';
  const base = stripHistoricalYearBias(`${primary || keyword || ''} ${caption || ''}`.trim());
  const variants = [];

  if (kind === TOPIC_KINDS.SPORTS) {
    const sportsSuffix = [
      'match action closeup',
      'player celebration',
      'football game crowd',
      'athletic competition'
    ][index % 4];
    variants.push(`${base} ${sportsSuffix}`, `${primary || keyword} football news photo`);
  } else if (kind === TOPIC_KINDS.POLITICS) {
    // 政务/反腐：禁用美女肖像类词，偏新闻现场与象征构图
    variants.push(
      `${primary || keyword} 官方通报 新闻图片`,
      `${primary || keyword} 纪检监察 新闻现场`,
      'Chinese government press conference news photo',
      'anti corruption investigation newsroom documentary photo',
      'courthouse law justice documentary photo'
    );
  } else if (kind === TOPIC_KINDS.LIFESTYLE) {
    variants.push(`${base} lifestyle photo`, `${primary || keyword} real life scene`);
  } else {
    // 人物/娱乐新闻：主体名必须在搜词最前，避免漂到「医院」「癌症」泛图
    variants.push(
      `${primary || keyword} 资料图`,
      `${primary || keyword} 新闻 照片`,
      `${base} 人物 照片`,
      `${primary || keyword} portrait photo`
    );
  }

  return [...new Set(variants.map((q) => ensureQueryHasSubject(q, keyword)).filter(Boolean))];
}

function fallbackPlans(output, keyword, count, kind) {
  const paragraphs = output
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 12);

  return Array.from({ length: count }, (_, i) => {
    const paragraph = paragraphs[i % Math.max(paragraphs.length, 1)] || output.slice(0, 120);
    const caption = paragraph.slice(0, 40);
    const queries = buildSearchQueries({ keyword, caption, kind, index: i });
    return {
      caption,
      searchQuery: queries[0],
      scenePrompt:
        kind === TOPIC_KINDS.POLITICS
          ? `Serious documentary news photo about ${keyword}, official meeting or investigation atmosphere, no fashion model portrait`
          : `Photojournalism image about ${keyword}, relevant to: ${caption}`
    };
  });
}

function normalizePlans(plans, keyword, count, kind) {
  const subjects = extractCoreSubjects(keyword);
  const primary = subjects.find((s) => s !== keyword) || keyword || '';

  return plans.slice(0, count).map((item, i) => {
    let searchQuery = stripHistoricalYearBias(item.searchQuery || keyword || `news ${i + 1}`);
    // 纠正：政治新闻不要带进运动/人像词
    if (kind === TOPIC_KINDS.POLITICS) {
      searchQuery = searchQuery
        .replace(/\b(portrait|fashion|model|beauty|girl|woman|cute|school)\b/gi, '')
        .replace(/\b(player|football|stadium|celebration)\b/gi, '')
        .trim();
      if (!/news|official|government|court|investigation|通报|纪委|会议/.test(searchQuery)) {
        searchQuery = `${keyword} 新闻图片 官方通报`;
      }
    }
    if (kind === TOPIC_KINDS.SPORTS && !/close|action|player|match|football/i.test(searchQuery)) {
      searchQuery = `${searchQuery} match action`;
    }
    // 人物/娱乐等：搜词必须含主体名（如曲婉婷），禁止只搜「患癌」「医院」
    searchQuery = ensureQueryHasSubject(searchQuery, keyword);
    if (primary && kind === TOPIC_KINDS.GENERAL && !searchQuery.includes(primary)) {
      searchQuery = `${primary} ${searchQuery}`.trim();
    }
    return {
      caption: item.caption || `配图 ${i + 1}`,
      searchQuery: searchQuery || keyword,
      scenePrompt:
        item.scenePrompt ||
        `Relevant documentary photo about ${keyword}, must match topic, no unrelated lifestyle portrait`
    };
  });
}

export async function planArticleImages({ output, keyword, style, count }) {
  const mode = getMode();
  const context = `${style || ''} ${keyword || ''} ${output.slice(0, 400)}`;
  const kind = detectTopicKind(context);
  const newsLike = kind !== TOPIC_KINDS.LIFESTYLE;

  if (mode === 'mock' || !output) {
    return fallbackPlans(output || keyword, keyword, count, kind);
  }

  const today = getTodayLabel();
  const kindHint =
    kind === TOPIC_KINDS.POLITICS
      ? `主题属于政务/反腐/通报类。searchQuery 必须围绕“官方通报、纪检、会议、调查、法院”等，严禁出现美女、校服、时尚人像、网红肖像。`
      : kind === TOPIC_KINDS.SPORTS
        ? `主题属于赛事。searchQuery 用比赛动作/球员/现场，避免空荡球场鸟瞰。`
        : `searchQuery 必须与文章主题强相关，禁止无关人像。`;

  const subjects = extractCoreSubjects(keyword);
  const primary = subjects.find((s) => s !== keyword) || keyword || '';
  const subjectRule = primary
    ? `每条 searchQuery 必须以「${primary}」开头或明确包含该主体名；禁止只写患癌/医院/患者/癌症等泛词而不带人名。`
    : 'searchQuery 必须包含文章主题中的核心专名。';

  try {
    const response = await chatCompletions(
      {
        messages: [
          {
            role: 'system',
            content: `你是图文编辑助手。今天是 ${today}。
规则：
1. 每张配图必须严格对应主题与段落要点，图文语义一致。
2. ${kindHint}
3. ${subjectRule}
4. 禁止为了“好看”选无关人物肖像。
只返回 JSON 数组。`
          },
          {
            role: 'user',
            content: `文章主题：${keyword || '无'}
主体专名（搜图必须包含）：${primary || keyword || '无'}
风格：${style || '资讯'}
数量：${count}

文章内容：
${output.slice(0, 2800)}

返回 JSON 数组（长度 ${count}）：
[
  {
    "caption": "对应要点（中文，20字内）",
    "searchQuery": "用于搜图的中文关键词，必须含主体专名",
    "scenePrompt": "英文场景描述，强调与主题一致"
  }
]
硬性：${count} 条的 searchQuery 必须彼此明显不同（场景/主体/角度不同），禁止用近义词反复搜同一类图；每条都必须含「${primary || keyword}」。`
          }
        ],
        temperature: 0.2
      },
      { timeout: 90000 }
    );

    const raw = response.choices[0]?.message?.content || '';
    const plans = parseJsonArray(raw);
    if (!Array.isArray(plans) || plans.length === 0) {
      return fallbackPlans(output, keyword, count, kind);
    }
    return normalizePlans(plans, keyword, count, kind);
  } catch (err) {
    console.warn('[planArticleImages]', err.message);
    return fallbackPlans(output, keyword, count, kind);
  }
}

async function searchPexels(query, limit = 5) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  // 政治新闻少用 Pexels（图库偏生活方式，易跑偏）
  const params = new URLSearchParams({
    query,
    per_page: String(Math.max(limit, 5))
  });
  const res = await fetch(`${PEXELS_SEARCH}?${params}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.photos || []).map((p) => ({
    url: p.src?.large || p.src?.original,
    source: 'pexels',
    credit: p.photographer ? `Photo by ${p.photographer} on Pexels` : 'Pexels',
    photographer: p.photographer || '',
    sourceUrl: p.url || 'https://www.pexels.com',
    width: p.width,
    height: p.height,
    alt: p.alt || ''
  }));
}

async function getDuckDuckGoVqd(query) {
  const res = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(15000)
  });
  const html = await res.text();
  return html.match(/vqd=([\d-]+)/)?.[1] || null;
}

async function searchDuckDuckGoImages(query, limit = 8) {
  const vqd = await getDuckDuckGoVqd(query);
  if (!vqd) return [];
  const url = `https://duckduckgo.com/i.js?l=cn-zh&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://duckduckgo.com/'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, Math.max(limit, 8)).map((item) => ({
    url: item.image,
    source: 'web',
    credit: item.source ? `来源：${item.source}` : '网络公开检索',
    photographer: item.source || '',
    sourceUrl: item.url || '',
    width: item.width,
    height: item.height,
    alt: item.title || ''
  }));
}

function scorePhoto(photo, { kind, topicTokens = [], caption = '', keyword = '' } = {}) {
  const alt = `${photo.alt || ''} ${photo.credit || ''} ${photo.sourceUrl || ''}`.toLowerCase();
  const topicText = `${keyword} ${caption}`.toLowerCase();
  let score = 0;

  const subjects = extractCoreSubjects(keyword);
  for (const s of subjects) {
    const t = String(s).toLowerCase();
    if (t.length >= 2 && alt.includes(t)) score += 10;
  }

  // 标题/说明与主题关键词重合
  for (const token of topicTokens) {
    const t = token.toLowerCase();
    if (t && alt.includes(t)) score += 4;
    if (t && topicText.includes(t) && alt.includes(t)) score += 2;
  }

  if (kind === TOPIC_KINDS.POLITICS) {
    if (/会议|通报|纪委|官方|新闻|court|law|government|press|investigation|公文|反腐/.test(alt)) {
      score += 6;
    }
    // 强惩罚：无关美女/校服/时尚人像
    if (/girl|woman|beauty|fashion|model|portrait|cute|selfie|校服|美女|少女|网红|妆/.test(alt)) {
      score -= 12;
    }
    if (photo.source === 'pexels') score -= 3; // 政务题偏好真实新闻检索
  }

  if (kind === TOPIC_KINDS.SPORTS) {
    if (/player|football|soccer|match|goal|stadium|球员|进球|比赛/.test(alt)) score += 5;
    if (/aerial|panorama|empty stadium/.test(alt)) score -= 4;
    if (/fashion|beauty|model/.test(alt)) score -= 6;
  }

  // 通用：惩罚纯网红风；中文人名主题惩罚纯英文图库无关图
  if (/instagram|tiktok|selfie|cosmetic|makeup/.test(alt)) score -= 4;
  if (/[\u4e00-\u9fa5]{2,}/.test(keyword) && photo.source === 'pexels') score -= 5;

  return score;
}

/**
 * 用于跨次搜图去重：同一张图可能有不同 CDN/缩略图 URL
 */
export function imageUrlDedupKey(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const id =
      u.searchParams.get('id') ||
      u.searchParams.get('imgurl') ||
      u.searchParams.get('imgrefurl') ||
      u.searchParams.get('mediaurl');
    if (id) return `id:${decodeURIComponent(id)}`.toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    // bing/google 缩略图路径末段常能标识同一图
    const tail = path.split('/').filter(Boolean).slice(-2).join('/');
    return `${u.hostname}/${tail}`.toLowerCase();
  } catch {
    return raw.split('?')[0].toLowerCase();
  }
}

export function filterExcludedImages(candidates = [], excludeUrls = []) {
  const banned = new Set(
    (excludeUrls || []).map((u) => imageUrlDedupKey(u)).filter(Boolean)
  );
  if (!banned.size) return candidates.filter((p) => p?.url);
  return candidates.filter((p) => p?.url && !banned.has(imageUrlDedupKey(p.url)));
}

/**
 * @param {string} query
 * @param {number} limit
 * @param {{ keyword?: string, caption?: string, kind?: string, excludeUrls?: string[], index?: number }} context
 */
export async function searchWebImages(query, limit = 1, context = {}) {
  const keyword = context.keyword || '';
  const caption = context.caption || '';
  const kind = context.kind || detectTopicKind(`${keyword} ${caption} ${query}`);
  const topicTokens = extractTopicTokens(`${keyword} ${caption} ${query}`);
  const excludeUrls = context.excludeUrls || [];
  const index = Number(context.index) || 0;
  const safeQuery = ensureQueryHasSubject(query, keyword);
  const chineseSubject = /[\u4e00-\u9fa5]{2,}/.test(keyword);

  const diversity = [
    '',
    '资料图',
    '新闻照片',
    '公开活动',
    '舞台 现场'
  ][index % 5];

  const queries = [
    stripHistoricalYearBias(`${safeQuery} ${diversity}`.trim()),
    ...buildSearchQueries({ keyword, caption, kind, index }).slice(0, 3)
  ]
    .map((q) => ensureQueryHasSubject(q, keyword))
    .filter(Boolean);

  let candidates = [];

  // 政务新闻优先用网络检索，少依赖 Pexels；中文人名新闻同样少用 Pexels（库里几乎没有明星本人）
  for (const q of queries) {
    const fromDdg = await searchDuckDuckGoImages(q, 10);
    candidates.push(...fromDdg);
    if (kind !== TOPIC_KINDS.POLITICS && !chineseSubject) {
      const fromPexels = await searchPexels(q, 6);
      candidates.push(...fromPexels);
    }
    if (candidates.length >= 16) break;
  }

  // 政治题如果结果太少，再轻度补充象征类图库词（仍过滤人像）
  if (kind === TOPIC_KINDS.POLITICS && candidates.length < 4) {
    candidates.push(...(await searchPexels('courthouse justice documents news', 5)));
    candidates.push(...(await searchPexels('government meeting press conference', 5)));
  }

  const seen = new Set();
  candidates = candidates.filter((p) => {
    const key = imageUrlDedupKey(p.url);
    if (!p.url || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  candidates = candidates
    .map((p) => ({ ...p, _score: scorePhoto(p, { kind, topicTokens, caption, keyword }) }))
    .sort((a, b) => b._score - a._score);

  // 过滤明显负分图（如美女照给双开新闻）
  const positive = candidates.filter((p) => p._score >= 0);
  let pool = filterExcludedImages(positive.length ? positive : candidates, excludeUrls);

  // 排除后若空，放宽到全量再排一次（仍排除已用）
  if (!pool.length && excludeUrls.length) {
    pool = filterExcludedImages(candidates, excludeUrls);
  }

  // 有明确人名时优先只留标题含人名的图
  pool = pickRelevantWebImages(pool, { keyword, limit: Math.max(8, limit) });

  console.log(
    '[searchWebImages]',
    kind,
    'q=',
    safeQuery.slice(0, 40),
    'cand=',
    candidates.length,
    'afterExclude=',
    pool.length,
    'top=',
    pool[0]?._score,
    pool[0]?.alt?.slice(0, 40)
  );

  if (pool.length === 0) {
    throw new Error(`未找到与「${keyword || query}」相关的现场图片，请换关键词或改用 AI 配图`);
  }
  return pool.slice(0, Math.max(1, limit));
}

export function formatWebImageError(err) {
  const msg = err?.message || '搜图失败';
  if (msg.includes('未找到')) return '暂未找到合适配图，请换个主题或稍后再试';
  if (msg.includes('timeout') || msg.includes('aborted')) return '网络搜图超时，请稍后重试';
  return toUserErrorMessage(err, '网络搜图失败，请稍后重试');
}

export const WEB_IMAGE_FOOTER_MARKER = '【配图来源】';

export function buildWebImageAttribution(imageMeta) {
  if (!imageMeta?.length) return '';

  const sourceLines = imageMeta.map((item, i) => {
    const caption = item.caption || '配图';
    const credit = item.credit || '网络公开检索';
    const link = item.sourceUrl ? `（${item.sourceUrl}）` : '';
    return `图${i + 1}（${caption}）：${credit}${link}`;
  });

  return `

---
【配图来源】
${sourceLines.join('\n')}

【免责声明】
1. 本文配图来自互联网公开检索（含公开网页及图库），仅供内容示意与排版参考，不代表任何官方立场。
2. 配图可能与正文所述具体事件、时间或地点存在差异，发布前请自行核实图文匹配性。
3. 图片版权归原作者或原平台所有；如涉及侵权，请联系发布者删除。
4. 因使用本文内容及配图所产生的法律责任，由内容发布者自行承担。`;
}

export function splitArticleOutput(text) {
  const marker = `\n\n---\n${WEB_IMAGE_FOOTER_MARKER}`;
  const idx = text.indexOf(marker);
  if (idx === -1) {
    return { body: text || '', footer: '' };
  }
  return {
    body: text.slice(0, idx).trimEnd(),
    footer: text.slice(idx + 6).trimStart()
  };
}

export { detectTopicKind, TOPIC_KINDS };
