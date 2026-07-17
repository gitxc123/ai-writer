const NEWS_KEYWORDS = [
  '时事',
  '新闻',
  '资讯',
  '热点',
  '报道',
  '突发',
  '赛事',
  '比赛',
  '淘汰',
  '胜出',
  '世界杯',
  '奥运会',
  '政要',
  '发布会',
  '通报',
  '事故',
  '地震',
  '火灾',
  '停赛',
  '转会',
  '选举',
  '谈判',
  '制裁',
  '冲突',
  '战争',
  '疫情',
  '财报',
  '股价',
  '上市',
  '裁员',
  '官宣',
  '辟谣',
  '立案',
  '判决'
];

const NEWS_STYLES = ['时事新闻', '新闻', '资讯', '热点解读', '深度报道', '赛事报道', '人物动态'];

const NEWS_TEMPLATE_NAMES = ['今日头条创作', '头条', '新闻'];

export function getTodayLabel() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isNewsArticle({ templateName = '', style = '', keyword = '', prompt = '' } = {}) {
  const text = `${templateName} ${style} ${keyword} ${prompt}`.toLowerCase();

  if (NEWS_TEMPLATE_NAMES.some((name) => templateName.includes(name))) {
    if (NEWS_STYLES.some((s) => style.includes(s)) || NEWS_KEYWORDS.some((k) => keyword.includes(k))) {
      return true;
    }
  }

  if (NEWS_STYLES.some((s) => style.includes(s))) return true;

  const hitCount = NEWS_KEYWORDS.filter((k) => text.includes(k.toLowerCase())).length;
  if (hitCount >= 2) return true;

  if (/时事|新闻报道|赛事报道|热点新闻/.test(`${style}${keyword}`)) return true;

  return false;
}

export function buildNewsSystemPrompt() {
  const today = getTodayLabel();
  return `你是专业的中文时事/赛事资讯写作助手。今天是 ${today}。

硬性要求：
1. 用户主题默认指近期事件；禁止改写成几十年前的历史旧闻。
2. 若提供了「联网检索热点」，必须优先引用并着重展开其中的争议细节、人物行为、关键转折（如不传球强行射门、判罚争议、赛后反应），写成新闻主体，而不是空泛概述。
3. 只陈述有检索信息或用户主题支持的事实；不确定处写「据公开讨论/报道」「待核实」。
4. 可以加入主观观点与情绪，并与事实分开。
5. 不要捏造采访、知情人士、未公布官方声明。
6. 标题要抓住最吸睛的热点细节，而不是只写「某某队输了」；标题必须不超过 30 个字（含标点）。
7. 不要在正文中输出「图1：」「图2：」等图片说明文字。`;
}

export function buildNewsUserAddon({ keyword, style, researchText = '' }) {
  const today = getTodayLabel();
  return `

【时事写作约束】
今天：${today}
主题（必须围绕此主题）：${keyword || '（见上文）'}
风格：${style || '时事资讯'}
${researchText}
请按「近期新闻」口径撰写：先写清比赛/事件结果，再深挖联网热点细节，允许观点，严禁胡编旧闻。`;
}
