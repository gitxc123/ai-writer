import 'dotenv/config';
import { fetchHotTopics } from '../src/lib/hot-topics.js';

for (const name of ['今日头条创作', '小红书创作', '抖音文案']) {
  const r = await fetchHotTopics(name, { limit: 6 });
  console.log('===', name, r.channel, r.label, '===');
  console.log(r.topics.join(' | '));
}
process.exit(0);
