import 'dotenv/config';
import { getTodayLabel } from './news-guard.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function decodeHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDuckDuckGoResults(html) {
  const results = [];
  const re = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 12) {
    results.push({
      title: decodeHtml(m[2]),
      snippet: decodeHtml(m[3]),
      url: m[1]
    });
  }

  if (results.length === 0) {
    const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = titleRe.exec(html)) && results.length < 10) {
      const title = decodeHtml(m[1]);
      if (title.length > 4) results.push({ title, snippet: '', url: '' });
    }
  }
  return results.filter((r) => r.title.length > 4);
}

async function fetchDuckDuckGoHtml(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=cn-zh`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: 'https://html.duckduckgo.com/'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    console.warn('[news-research] ddg status', res.status, query);
    return [];
  }
  const html = await res.text();
  if (/anomaly|captcha|challenge/i.test(html)) {
    console.warn('[news-research] ddg challenge page');
    return [];
  }
  return extractDuckDuckGoResults(html);
}

/** Bing 网页检索（无需 key 的公开入口，成功率通常更高） */
async function fetchBingResults(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans&count=10`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) return [];
  const html = await res.text();
  const results = [];
  const re = /<li class="b_algo"[\s\S]*?<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p>|class="b_caption"[\s\S]*?<p[^>]*>)([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 10) {
    results.push({
      url: m[1],
      title: decodeHtml(m[2]),
      snippet: decodeHtml(m[3])
    });
  }
  return results.filter((r) => r.title.length > 4);
}

function buildSearchQueries(keyword) {
  const year = new Date().getFullYear();
  const base = String(keyword || '').trim();
  const queries = [
    `${base}`,
    `${base} 最新 焦点`,
    `${base} 争议 传球 射门`,
    `${base} ${year}`,
    // 英文补充，便于抓到国际体育站细节
    `${base} Norway England Haaland pass shot controversy`
  ];
  return [...new Set(queries.filter(Boolean))];
}

function scoreItem(item, keyword) {
  const text = `${item.title} ${item.snippet}`.toLowerCase();
  const keys = String(keyword || '')
    .toLowerCase()
    .split(/[\s,，、：:]+/)
    .filter((k) => k.length >= 2);
  let score = 0;
  for (const k of keys) {
    if (text.includes(k.toLowerCase())) score += 2;
  }
  if (/\b(19\d{2}|200\d|201\d|2020|2021|2022)\b/.test(text) && !text.includes(String(new Date().getFullYear()))) {
    score -= 4;
  }
  if (/焦点|争议|传球|射门|绝杀|点球|红牌|哈兰德|haaland|判罚|赛后|助攻|单刀/.test(text)) score += 4;
  if (/乱码|编码|opencc|翻译/.test(text)) score -= 8;
  if (item.snippet.length > 20) score += 1;
  return score;
}

export async function researchNewsHotspots(keyword, { limit = 8 } = {}) {
  const topic = String(keyword || '').trim();
  if (!topic) return { today: getTodayLabel(), topic: '', items: [], summaryText: '' };

  const queries = buildSearchQueries(topic);
  const collected = [];

  for (const q of queries) {
    try {
      let rows = await fetchBingResults(q);
      if (!rows.length) rows = await fetchDuckDuckGoHtml(q);
      collected.push(...rows);
      console.log('[news-research] query hits', q.slice(0, 40), rows.length);
      if (collected.length >= 18) break;
    } catch (err) {
      console.warn('[news-research]', q, err.message);
    }
  }

  const seen = new Set();
  const unique = [];
  for (const item of collected) {
    const key = item.title.slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  unique.sort((a, b) => scoreItem(b, topic) - scoreItem(a, topic));
  const items = unique.filter((i) => scoreItem(i, topic) > -2).slice(0, limit);

  const lines = items.map((item, i) => {
    const snip = item.snippet ? ` —— ${item.snippet}` : '';
    return `${i + 1}. ${item.title}${snip}`;
  });

  const summaryText = items.length
    ? `【联网检索到的相关热点（供写作引用，请优先展开其中有冲突/细节/争议的点）】\n${lines.join('\n')}`
    : '【联网检索结果较少】请围绕用户主题写已知要点与观点，不要编造具体未检索到的细节；若用户主题本身已包含细节（如不传球强行射门），必须把该细节作为全文重点展开。';

  console.log('[news-research]', topic, 'hits=', items.length);
  return {
    today: getTodayLabel(),
    topic,
    items,
    summaryText
  };
}

export function formatHotspotsForPrompt(research) {
  if (!research?.summaryText) return '';
  return `

${research.summaryText}

【写作要求补充】
1. 必须优先把检索结果中的「争议细节 / 关键转折 / 人物行为」写进正文并着重展开（例如：该传没传、强行射门、争议判罚、赛后评价等）。
2. 如果用户主题里已经写了具体细节，即使检索结果不多，也必须把该细节作为核心看点展开评论。
3. 可以加入主观评论，但事实点应来自检索信息或用户主题，不要另编历史旧闻。
4. 不确定信息用「据网络讨论/公开报道」表述。
5. 结构建议：抓人标题（含热点细节，标题≤30字）→ 事件概述 → 2-3 个热点细节深挖 → 观点评论 → 结尾。
6. 不要在正文里写「图1：」等图片说明。`;
}
