const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CHANNEL_CONFIG = {
  小红书创作: {
    channel: 'xiaohongshu',
    label: '小红书热门',
    queries: ['小红书今日热门话题', '小红书热搜种草', '小红书爆款笔记话题'],
    sources: ['weibo', 'baidu', 'bing']
  },
  今日头条创作: {
    channel: 'toutiao',
    label: '头条热点',
    queries: ['今日头条热搜', '今日热点新闻', '微博热搜榜'],
    sources: ['weibo', 'baidu', 'bing']
  },
  公众号文案: {
    channel: 'wechat',
    label: '公众号热点',
    queries: ['微信公众号热文', '今日深度话题', '职场情感热点'],
    sources: ['baidu', 'bing']
  },
  抖音文案: {
    channel: 'douyin',
    label: '抖音热门',
    queries: ['抖音热搜榜', '抖音今日热点', '短视频热门话题'],
    sources: ['weibo', 'baidu', 'bing']
  },
  产品介绍: {
    channel: 'product',
    label: '消费热点',
    queries: ['数码热销产品', '今日种草好物', '消费电子热点'],
    sources: ['baidu', 'bing']
  }
};

function decodeHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return decodeHtml(title)
    .replace(/^(热搜|置顶|沸|新|荐)\s*/g, '')
    .replace(/^\d+[\.、\s]+/, '')
    .replace(/\s*[|｜].*$/, '')
    .trim();
}

async function fetchWeiboHot() {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: 'https://weibo.com/'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.data?.realtime || [];
    return list
      .map((item) => cleanTitle(item.word || item.note || ''))
      .filter((t) => t.length >= 2 && t.length <= 40)
      .slice(0, 12);
  } catch (err) {
    console.warn('[hot] weibo', err.message);
    return [];
  }
}

async function fetchBaiduHot() {
  try {
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const titles = [];
    const re = /"word"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) && titles.length < 15) {
      const t = cleanTitle(m[1]);
      if (t.length >= 2 && t.length <= 40) titles.push(t);
    }
    return [...new Set(titles)].slice(0, 12);
  } catch (err) {
    console.warn('[hot] baidu', err.message);
    return [];
  }
}

async function fetchBingHot(query) {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans&count=10`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const titles = [];
    const re = /<li class="b_algo"[\s\S]*?<h2>\s*<a[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && titles.length < 10) {
      const t = cleanTitle(m[1]);
      if (t.length >= 4 && t.length <= 48) titles.push(t);
    }
    return [...new Set(titles)];
  } catch (err) {
    console.warn('[hot] bing', err.message);
    return [];
  }
}

function getConfig(templateName = '') {
  return (
    CHANNEL_CONFIG[templateName] || {
      channel: 'general',
      label: '今日热门',
      queries: ['今日热点', '微博热搜'],
      sources: ['weibo', 'baidu', 'bing']
    }
  );
}

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchHotTopics(templateName, { limit = 8, force = false } = {}) {
  const config = getConfig(templateName);
  const cacheKey = config.channel;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return {
      channel: config.channel,
      label: config.label,
      topics: rotateTopics(cached.topics, limit),
      updatedAt: cached.at
    };
  }

  const collected = [];
  const preferBingFirst = ['xiaohongshu', 'wechat', 'product', 'douyin', 'shortvideo'].includes(config.channel);

  if (preferBingFirst) {
    for (const q of config.queries) {
      if (collected.length >= 12) break;
      collected.push(...(await fetchBingHot(q)));
    }
  }

  if (config.sources.includes('weibo')) {
    collected.push(...(await fetchWeiboHot()));
  }
  if (config.sources.includes('baidu') && collected.length < 14) {
    collected.push(...(await fetchBaiduHot()));
  }

  if (!preferBingFirst && config.sources.includes('bing')) {
    for (const q of config.queries.slice(0, 2)) {
      if (collected.length >= 16) break;
      collected.push(...(await fetchBingHot(q)));
    }
  }

  // 小红书/产品类：弱化硬新闻，优先生活方式词
  const lifestylePreferred = ['xiaohongshu', 'product'].includes(config.channel);
  const scored = [];
  const seen = new Set();
  for (const t of collected) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    if (/登录|下载|首页|热搜榜|实时|官网/.test(t)) continue;
    seen.add(key);
    let score = 0;
    if (lifestylePreferred) {
      if (/种草|好物|穿搭|美食|护肤|旅行|家居|测评|平价|探店/.test(t)) score += 5;
      if (/受贿|获刑|政策|会议|外交|战争|地震/.test(t)) score -= 4;
    }
    if (config.channel === 'toutiao') {
      if (/世界杯|热搜|突发|官方|赛|判|争议/.test(t)) score += 3;
    }
    scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const topics = scored.map((x) => x.t).slice(0, 16);

  cache.set(cacheKey, { topics, at: Date.now(), cursor: 0 });
  console.log('[hot]', config.channel, 'topics=', topics.length);

  return {
    channel: config.channel,
    label: config.label,
    topics: rotateTopics(topics, limit),
    updatedAt: Date.now()
  };
}

function rotateTopics(topics, limit) {
  if (!topics?.length) return [];
  // 用时间分钟做偏移，让「换一批」看起来有变化
  const offset = Math.floor(Date.now() / 30000) % topics.length;
  const rotated = [...topics.slice(offset), ...topics.slice(0, offset)];
  return rotated.slice(0, limit);
}
