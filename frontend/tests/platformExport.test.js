import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { charLen, clampToutiaoTitle, TOUTIAO_TITLE_MAX } from '../src/utils/platformLimits.js';
import { buildPlatformPack } from '../src/utils/platformExport.js';

describe('platformLimits', () => {
  it('clamps toutiao title to 30 chars', () => {
    const long =
      '14万级SUV杀入慕尼黑！小鹏MONA L03全球上市，性价比还是“价格战”新武器？';
    const out = clampToutiaoTitle(long);
    assert.ok(charLen(out) <= TOUTIAO_TITLE_MAX);
    assert.ok(charLen(long) > TOUTIAO_TITLE_MAX);
  });
});

describe('buildPlatformPack image link mode', () => {
  it('embeds public image urls for toutiao', () => {
    const pack = buildPlatformPack({
      templateName: '今日头条创作',
      output:
        '14万级SUV杀入慕尼黑！小鹏MONA L03全球上市，性价比还是“价格战”新武器？\n\n正文第一段。\n\n正文第二段。',
      images: [
        {
          url: '/uploads/local.jpg',
          remoteUrl: 'https://cdn.example.com/a.jpg',
          caption: '小鹏MONA首发'
        }
      ]
    });

    assert.ok(charLen(pack.title) <= 30);
    assert.ok(pack.html.includes('https://cdn.example.com/a.jpg'));
    assert.ok(pack.html.includes('<img'));
    assert.ok(pack.text.includes('https://cdn.example.com/a.jpg'));
  });
});
