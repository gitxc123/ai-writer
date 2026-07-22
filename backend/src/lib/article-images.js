import { chatCompletions, getMode } from './ai.js';
import { getTodayLabel } from './news-guard.js';
import { toUserErrorMessage } from './user-error.js';

const PEXELS_SEARCH = 'https://api.pexels.com/v1/search';

const TOPIC_KINDS = {
  SPORTS: 'sports',
  POLITICS: 'politics',
  LIFESTYLE: 'lifestyle',
  NEWS: 'news',
  GENERAL: 'general'
};

const DISASTER_EVENT_RE =
  /山体垮塌|山体滑坡|泥石流|垮塌|滑坡|塌方|坍塌|地震|火灾|爆炸|洪涝|洪水|台风|海啸|暴雨|溃坝|矿难|空难|车祸|交通事故|踩踏|泄漏|沉船/;

const DISASTER_SYNONYMS = {
  山体垮塌: ['山体垮塌', '垮塌', '滑坡', '山体滑坡', '塌方', '坍塌'],
  山体滑坡: ['山体滑坡', '滑坡', '垮塌', '山体垮塌', '塌方'],
  垮塌: ['垮塌', '滑坡', '山体垮塌', '塌方', '坍塌'],
  滑坡: ['滑坡', '垮塌', '山体滑坡', '山体垮塌', '塌方'],
  地震: ['地震', '余震'],
  火灾: ['火灾', '起火', '大火', '火情'],
  爆炸: ['爆炸', '爆燃'],
  洪水: ['洪水', '洪涝', '内涝', '暴雨'],
  洪涝: ['洪涝', '洪水', '内涝'],
  台风: ['台风', '风暴'],
  车祸: ['车祸', '交通事故', '连环撞'],
  交通事故: ['交通事故', '车祸']
};

function detectTopicKind(text = '') {
  const t = String(text);
  if (/世界杯|赛事|比赛|淘汰|进球|传球|哈兰德|足球|篮球|奥运|球员|教练/.test(t)) {
    return TOPIC_KINDS.SPORTS;
  }
  if (/双开|通报|纪委|受贿|落马|立案|法院|判决|官员|反腐|查处|违纪|开除/.test(t)) {
    return TOPIC_KINDS.POLITICS;
  }
  if (DISASTER_EVENT_RE.test(t) || /突发|事故|救援|遇难|伤亡|灾情|抢险/.test(t)) {
    return TOPIC_KINDS.NEWS;
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

const PERSON_EVENT_TAIL_RE =
  /(患癌|确诊|病逝|去世|逝世|结婚|离婚|分手|复合|代言|演唱会|发布会|道歉|出轨|怀孕|生子|落马|双开|被抓|被查|通报|起诉|胜诉|败诉|获奖|夺冠|退役|复出|官宣|出道|退圈|塌房|翻车|爆料|回应|发声|被曝|传出)+$/;

function cleanKeyword(keyword = '') {
  return String(keyword || '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventSynonyms(event = '') {
  if (!event) return [];
  const mapped = DISASTER_SYNONYMS[event];
  if (mapped) return mapped;
  return [event];
}

/**
 * 解析搜图锚点：地点 / 灾害事件 / 人名。
 * 例：重庆山体垮塌 → place=重庆 event=山体垮塌
 * 例：曲婉婷患癌 → person=曲婉婷
 */
export function extractSearchAnchors(keyword = '') {
  const full = cleanKeyword(keyword);
  const anchors = {
    full,
    place: '',
    event: '',
    person: '',
    tokens: []
  };
  if (!full) return anchors;

  const tokens = new Set([full]);
  const eventMatch = full.match(DISASTER_EVENT_RE);
  if (eventMatch) {
    anchors.event = eventMatch[0];
    for (const s of eventSynonyms(anchors.event)) tokens.add(s);

    const before = full.slice(0, full.indexOf(anchors.event)).replace(/(市|县|区|州|盟)$/, '');
    const place = before.match(/^[\u4e00-\u9fa5]{2,4}/)?.[0] || '';
    if (place) {
      anchors.place = place;
      tokens.add(place);
    }
  }

  if (!anchors.event && PERSON_EVENT_TAIL_RE.test(full)) {
    const person = full.replace(PERSON_EVENT_TAIL_RE, '').replace(/^(关于|最新|突发|重磅|独家)/, '').trim();
    if (person.length >= 2) {
      anchors.person = person.match(/^[\u4e00-\u9fa5]{2,4}/)?.[0] || person;
      tokens.add(anchors.person);
    }
  }

  if (!anchors.person && !anchors.event) {
    const cnName = full.match(/^[\u4e00-\u9fa5]{2,4}/);
    if (cnName) tokens.add(cnName[0]);
  }

  const en = full.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/);
  if (en) tokens.add(en[0]);

  anchors.tokens = [...tokens].filter((t) => t && t.length >= 2).sort((a, b) => b.length - a.length);
  return anchors;
}

/**
 * 从主题里抽出主体（人名/地点/事件等）。
 * 例：曲婉婷患癌 → 曲婉婷；重庆山体垮塌 → 重庆、山体垮塌
 */
export function extractCoreSubjects(keyword = '') {
  const a = extractSearchAnchors(keyword);
  const subjects = new Set(a.tokens);
  if (a.place) subjects.add(a.place);
  if (a.event) subjects.add(a.event);
  if (a.person) subjects.add(a.person);
  if (a.full) subjects.add(a.full);
  return [...subjects].sort((a, b) => b.length - a.length);
}

/** 保证搜词带上地点+事件或人名，防止漂成「救援航拍」「医院」等泛词 */
export function ensureQueryHasSubject(query, keyword = '') {
  const q = String(query || '').trim();
  const a = extractSearchAnchors(keyword);
  if (!a.full) return q;

  let next = q;
  if (a.place && a.event) {
    const hasPlace = next.includes(a.place);
    const hasEvent = eventSynonyms(a.event).some((s) => next.includes(s));
    if (!hasPlace || !hasEvent) {
      next = `${a.place} ${a.event} ${next || '新闻 现场'}`.trim();
    }
    return next;
  }

  const subjects = extractCoreSubjects(keyword);
  const hay = next.toLowerCase();
  const hit = subjects.some((s) => hay.includes(String(s).toLowerCase()));
  if (hit) return next || a.full;

  const primary = a.person || subjects.find((s) => s !== keyword) || subjects[0];
  return `${primary} ${next || '新闻 资料图'}`.trim();
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

function photoAltText(photo = {}) {
  return `${photo.alt || ''} ${photo.credit || ''} ${photo.sourceUrl || ''}`.toLowerCase();
}

/**
 * 有明确主体时只保留相关图。
 * 时事灾害：必须同时命中地点 + 事件（或同义），不命中则返回空，禁止回退到无关图。
 */
export function pickRelevantWebImages(candidates = [], { keyword = '', limit = 1 } = {}) {
  const a = extractSearchAnchors(keyword);
  const max = Math.max(1, limit);

  if (a.place && a.event) {
    const syns = eventSynonyms(a.event);
    const matched = candidates.filter((p) => {
      const alt = photoAltText(p);
      const hasPlace = alt.includes(a.place.toLowerCase());
      const hasEvent = syns.some((s) => alt.includes(String(s).toLowerCase()));
      return hasPlace && hasEvent;
    });
    return matched.slice(0, max);
  }

  const keys = extractCoreSubjects(keyword).filter((s) => s && s.length >= 2);
  if (!keys.length) return candidates.slice(0, max);

  const matched = candidates.filter((p) => {
    const alt = photoAltText(p);
    return keys.some((s) => alt.includes(String(s).toLowerCase()));
  });

  // 人名/专名：有命中用命中；无人名硬约束时才允许回退
  if (matched.length) return matched.slice(0, max);
  if (a.person) return [];
  return candidates.slice(0, max);
}

function buildSearchQueries({ keyword, caption, kind, index }) {
  const a = extractSearchAnchors(keyword);
  const subjects = extractCoreSubjects(keyword);
  const primary = a.person || a.place || subjects.find((s) => s !== keyword) || keyword || '';
  const base = stripHistoricalYearBias(
    `${a.place && a.event ? `${a.place} ${a.event}` : primary || keyword || ''} ${caption || ''}`.trim()
  );
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
    variants.push(
      `${primary || keyword} 官方通报 新闻图片`,
      `${primary || keyword} 纪检监察 新闻现场`,
      'Chinese government press conference news photo',
      'anti corruption investigation newsroom documentary photo',
      'courthouse law justice documentary photo'
    );
  } else if (kind === TOPIC_KINDS.NEWS || (a.place && a.event)) {
    // 时事灾害：地点+事件，禁止人像/舞台类词
    const place = a.place || primary;
    const event = a.event || keyword;
    variants.push(
      `${place} ${event} 现场`,
      `${place} ${event} 新闻 照片`,
      `${place} ${event} 救援`,
      `${place} landslide collapse news photo`,
      `${place} ${event} 航拍`
    );
  } else if (kind === TOPIC_KINDS.LIFESTYLE) {
    variants.push(`${base} lifestyle photo`, `${primary || keyword} real life scene`);
  } else if (a.person) {
    variants.push(
      `${a.person} 资料图`,
      `${a.person} 新闻 照片`,
      `${a.person} 公开活动`,
      `${a.person} portrait photo`
    );
  } else {
    variants.push(`${keyword} 新闻 现场`, `${keyword} 资料图`, `${base} news photo`);
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
  const a = extractSearchAnchors(keyword);
  const subjects = extractCoreSubjects(keyword);
  const primary = a.person || a.place || subjects.find((s) => s !== keyword) || keyword || '';

  return plans.slice(0, count).map((item, i) => {
    let searchQuery = stripHistoricalYearBias(item.searchQuery || keyword || `news ${i + 1}`);
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
    if (kind === TOPIC_KINDS.NEWS || (a.place && a.event)) {
      searchQuery = searchQuery
        .replace(/\b(portrait|fashion|model|beauty|stage|concert|selfie)\b/gi, '')
        .replace(/人物|写真|舞台|演唱会|网红/g, '')
        .trim();
    }
    searchQuery = ensureQueryHasSubject(searchQuery, keyword);
    if (a.place && a.event) {
      searchQuery = ensureQueryHasSubject(searchQuery, keyword);
    } else if (primary && kind === TOPIC_KINDS.GENERAL && !searchQuery.includes(primary)) {
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
        : kind === TOPIC_KINDS.NEWS
          ? `主题属于时事灾害/事故。searchQuery 必须同时含地点与事件（如“重庆 山体垮塌 现场”），严禁人像、夜景、舞台、风景名胜。`
          : `searchQuery 必须与文章主题强相关，禁止无关人像。`;

  const anchors = extractSearchAnchors(keyword);
  const primary =
    anchors.place && anchors.event
      ? `${anchors.place}${anchors.event}`
      : anchors.person || extractCoreSubjects(keyword).find((s) => s !== keyword) || keyword || '';
  const subjectRule =
    anchors.place && anchors.event
      ? `每条 searchQuery 必须同时包含地点「${anchors.place}」和事件「${anchors.event}」；禁止只写救援/航拍/现场等泛词。`
      : primary
        ? `每条 searchQuery 必须以「${primary}」开头或明确包含该主体；禁止只写患癌/医院/患者等泛词。`
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
4. 禁止为了“好看”选无关人物肖像或城市风景。
5. scenePrompt 若涉及人物，必须明确写 East Asian / Asian people（东亚/亚洲人外貌），不要写西方白人面孔。
只返回 JSON 数组。`
          },
          {
            role: 'user',
            content: `文章主题：${keyword || '无'}
搜图必须包含：${primary || keyword || '无'}
风格：${style || '资讯'}
数量：${count}

文章内容：
${output.slice(0, 2800)}

返回 JSON 数组（长度 ${count}）：
[
  {
    "caption": "对应要点（中文，20字内）",
    "searchQuery": "用于搜图的中文关键词，必须含地点与事件或主体专名",
    "scenePrompt": "英文场景描述，强调与主题一致"
  }
]
硬性：${count} 条的 searchQuery 必须彼此明显不同；每条都必须含「${primary || keyword}」。`
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

  try {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.max(limit, 5))
    });
    const res = await fetch(`${PEXELS_SEARCH}?${params}`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      console.warn('[searchPexels] http', res.status, String(query).slice(0, 40));
      return [];
    }
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
  } catch (err) {
    console.warn('[searchPexels]', err.message, String(query).slice(0, 40));
    return [];
  }
}

async function getDuckDuckGoVqd(query) {
  try {
    const res = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });
    const html = await res.text();
    return html.match(/vqd=([\d-]+)/)?.[1] || null;
  } catch (err) {
    console.warn('[ddg:vqd]', err.message);
    return null;
  }
}

async function searchDuckDuckGoImages(query, limit = 8) {
  try {
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
    if (!res.ok) {
      console.warn('[searchDuckDuckGo] http', res.status, String(query).slice(0, 40));
      return [];
    }
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
  } catch (err) {
    console.warn('[searchDuckDuckGo]', err.message, String(query).slice(0, 40));
    return [];
  }
}

function scorePhoto(photo, { kind, topicTokens = [], caption = '', keyword = '' } = {}) {
  const alt = photoAltText(photo);
  const topicText = `${keyword} ${caption}`.toLowerCase();
  let score = 0;
  const a = extractSearchAnchors(keyword);

  if (a.place && a.event) {
    const hasPlace = alt.includes(a.place.toLowerCase());
    const hasEvent = eventSynonyms(a.event).some((s) => alt.includes(String(s).toLowerCase()));
    if (hasPlace && hasEvent) score += 20;
    else if (hasPlace || hasEvent) score += 2;
    else score -= 8;
    if (/夜景|洪崖洞|旅游|风景|舞台|演唱会|写真|网红|美女/.test(alt)) score -= 10;
  }

  for (const s of extractCoreSubjects(keyword)) {
    const t = String(s).toLowerCase();
    if (t.length >= 2 && alt.includes(t)) score += 10;
  }

  for (const token of topicTokens) {
    const t = token.toLowerCase();
    if (t && alt.includes(t)) score += 4;
    if (t && topicText.includes(t) && alt.includes(t)) score += 2;
  }

  if (kind === TOPIC_KINDS.POLITICS) {
    if (/会议|通报|纪委|官方|新闻|court|law|government|press|investigation|公文|反腐/.test(alt)) {
      score += 6;
    }
    if (/girl|woman|beauty|fashion|model|portrait|cute|selfie|校服|美女|少女|网红|妆/.test(alt)) {
      score -= 12;
    }
    if (photo.source === 'pexels') score -= 3;
  }

  if (kind === TOPIC_KINDS.NEWS) {
    if (/救援|现场|垮塌|滑坡|事故|灾情|抢险|collapse|landslide/.test(alt)) score += 6;
    if (/portrait|fashion|model|beauty|concert|stage/.test(alt)) score -= 10;
    if (photo.source === 'pexels') score -= 6;
  }

  if (kind === TOPIC_KINDS.SPORTS) {
    if (/player|football|soccer|match|goal|stadium|球员|进球|比赛/.test(alt)) score += 5;
    if (/aerial|panorama|empty stadium/.test(alt)) score -= 4;
    if (/fashion|beauty|model/.test(alt)) score -= 6;
  }

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
  const anchors = extractSearchAnchors(keyword);
  const safeQuery = ensureQueryHasSubject(query, keyword);
  const chineseNews = Boolean(anchors.place && anchors.event) || kind === TOPIC_KINDS.NEWS;
  const chineseSubject = /[\u4e00-\u9fa5]{2,}/.test(keyword);

  const diversity = chineseNews
    ? ['', '现场', '救援', '航拍', '新闻'][index % 5]
    : ['', '资料图', '新闻照片', '公开活动', '现场'][index % 5];

  const queries = [
    stripHistoricalYearBias(`${safeQuery} ${diversity}`.trim()),
    ...buildSearchQueries({ keyword, caption, kind, index }).slice(0, 4)
  ]
    .map((q) => ensureQueryHasSubject(q, keyword))
    .filter(Boolean);

  let candidates = [];
  let ddgOk = false;

  for (const q of queries) {
    const fromDdg = await searchDuckDuckGoImages(q, 12);
    if (fromDdg.length) ddgOk = true;
    candidates.push(...fromDdg);

    // 非敏感主题：每轮都补 Pexels；敏感主题仅在 DDG 整轮偏空时再补
    const allowPexelsEarly = kind !== TOPIC_KINDS.POLITICS && !chineseSubject && !chineseNews;
    if (allowPexelsEarly) {
      candidates.push(...(await searchPexels(q, 6)));
    }
    if (candidates.length >= 20) break;
  }

  // DDG 全部失败或候选仍少：用 Pexels / 通用英文词兜底（新闻灾害仍优先相关过滤）
  if (candidates.length < 4) {
    const fallbackQueries = [safeQuery, keyword, stripHistoricalYearBias(`${keyword} photo`)]
      .map((q) => String(q || '').trim())
      .filter((q) => q.length >= 2);
    for (const q of fallbackQueries) {
      if (kind === TOPIC_KINDS.POLITICS || chineseNews) break;
      candidates.push(...(await searchPexels(q, 8)));
      if (candidates.length >= 12) break;
    }
    if (!ddgOk) {
      console.warn('[searchWebImages] DDG empty/failed, used Pexels fallback', {
        kind,
        cand: candidates.length
      });
    }
  }

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

  const positive = candidates.filter((p) => p._score >= 0);
  let pool = filterExcludedImages(positive.length ? positive : candidates, excludeUrls);

  if (!pool.length && excludeUrls.length) {
    pool = filterExcludedImages(candidates, excludeUrls);
  }

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

export const AI_TEXT_FOOTER_MARKER = '【AI 生成说明】';

export const COMPACT_NOTE_MARKER = '【说明】';

/** 面向读者的正文标识（写入文稿）；勿与「服务提醒用户」混写 */
export const AUDIENCE_LABEL_MARKER = '【标识】';

export const IMAGE_LABEL_MARKER = '【作者声明】';

export const AI_IMAGE_CREDIT = 'AI 生成配图，非现场真实照片';

export const PRODUCT_IMAGE_CREDIT = '基于用户上传产品图的 AI 生成/编辑，非实拍成片';

/** 写入文稿的【作者声明】（面向观众） */
export const AUTHOR_STATEMENT_AI =
  '本文配图均为人工智能生成，并非真实拍摄照片，仅供示意与参考。';

export const AUTHOR_STATEMENT_WEB =
  '本文配图来源于网络公开检索，其真实性及与正文所述情形是否一致有待核实；图片权利归原作者或原平台所有。如权利人认为侵权，请联系发布者删除。';

export const AUTHOR_STATEMENT_PRODUCT =
  '本文配图基于上传素材经人工智能生成或编辑，并非未加说明的实拍成片，仅供产品展示参考。';

const FOOTER_MARKERS = [
  WEB_IMAGE_FOOTER_MARKER,
  AI_TEXT_FOOTER_MARKER,
  COMPACT_NOTE_MARKER,
  AUDIENCE_LABEL_MARKER,
  IMAGE_LABEL_MARKER,
  '【声明】'
];

export function stripComplianceFooters(output) {
  let text = String(output || '');
  for (const marker of FOOTER_MARKERS) {
    const withRule = `\n\n---\n${marker}`;
    let idx = text.indexOf(withRule);
    if (idx >= 0) {
      text = text.slice(0, idx).trimEnd();
      continue;
    }
    idx = text.indexOf(`\n${marker}`);
    if (idx >= 0) text = text.slice(0, idx).trimEnd();
  }
  return text;
}

/** 正文不再强制加「AI 辅助生成」总标识；配图侧另有标注时可附加 */
export function buildTextAiAttribution() {
  return '';
}

function formatAuthorStatement(imageSource) {
  if (imageSource === 'web') return AUTHOR_STATEMENT_WEB;
  if (imageSource === 'product') return AUTHOR_STATEMENT_PRODUCT;
  return AUTHOR_STATEMENT_AI;
}

/** 面向观众的作者声明；版权/授权等对创作者的提醒不写入文稿 */
export function buildWebImageAttribution(imageMeta) {
  if (!imageMeta?.length) return '';
  return `

【作者声明】
${AUTHOR_STATEMENT_WEB}`;
}

export function buildAiImageAttribution(imageMeta) {
  if (!imageMeta?.length) return '';
  return `

【作者声明】
${AUTHOR_STATEMENT_AI}`;
}

export function buildProductImageAttribution(imageMeta) {
  if (!imageMeta?.length) return '';
  return `

【作者声明】
${AUTHOR_STATEMENT_PRODUCT}`;
}

export function buildImageAttribution(imageSource, imageMeta) {
  if (!imageMeta?.length) return '';
  if (imageSource === 'web' || imageSource === 'ai' || imageSource === 'product') {
    return `

【作者声明】
${formatAuthorStatement(imageSource)}`;
  }
  return '';
}

/** 仅附加面向读者的配图标注（不再写入「本文由 AI 辅助生成」总标识） */
export function withComplianceFooters(output, imageSource, imageMeta) {
  const body = stripComplianceFooters(output);
  const img = String(buildImageAttribution(imageSource, imageMeta) || '').trim();
  if (!img) return body;
  return `${body}\n\n---\n${img}`;
}

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

export { detectTopicKind, TOPIC_KINDS };
