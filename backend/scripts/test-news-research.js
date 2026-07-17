import 'dotenv/config';
import { researchNewsHotspots } from '../src/lib/news-research.js';

const topic = '2026世界杯挪威队不敌英格兰惨遭淘汰 哈兰德';
const result = await researchNewsHotspots(topic, { limit: 8 });
console.log('topic:', topic);
console.log('hits:', result.items.length);
for (const item of result.items) {
  console.log('-', item.title);
  if (item.snippet) console.log(' ', item.snippet.slice(0, 140));
}
console.log('--- summary preview ---');
console.log(result.summaryText.slice(0, 500));
