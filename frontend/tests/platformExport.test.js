import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { charLen, clampToutiaoTitle, TOUTIAO_TITLE_MAX } from '../src/utils/platformLimits.js';
import {
  buildPlatformPack,
  safeExportImageUrl,
  absolutizeExportImageUrl
} from '../src/utils/platformExport.js';

describe('platformLimits', () => {
  it('clamps toutiao title to 30 chars', () => {
    const long =
      '14万级SUV杀入慕尼黑！小鹏MONA L03全球上市，性价比还是“价格战”新武器？';
    const out = clampToutiaoTitle(long);
    assert.ok(charLen(out) <= TOUTIAO_TITLE_MAX);
    assert.ok(charLen(long) > TOUTIAO_TITLE_MAX);
  });
});

describe('safeExportImageUrl', () => {
  it('allows http(s) and /uploads/', () => {
    assert.equal(safeExportImageUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
    assert.equal(safeExportImageUrl('/uploads/a.webp'), '/uploads/a.webp');
  });

  it('rejects dangerous or unsupported schemes', () => {
    assert.equal(safeExportImageUrl('javascript:alert(1)'), '');
    assert.equal(safeExportImageUrl('data:image/png;base64,xx'), '');
    assert.equal(safeExportImageUrl('file:///etc/passwd'), '');
    assert.equal(safeExportImageUrl('/uploads/../x'), '');
  });

  it('allows signed /uploads query strings', () => {
    assert.equal(
      safeExportImageUrl('/uploads/a.webp?e=123&s=abc'),
      '/uploads/a.webp?e=123&s=abc'
    );
  });

  it('absolutizes /uploads with base origin', () => {
    assert.equal(
      absolutizeExportImageUrl('/uploads/a.webp?e=1', 'https://app.example.com'),
      'https://app.example.com/uploads/a.webp?e=1'
    );
  });
});

describe('buildPlatformPack link mode', () => {
  it('includes image urls in html and plain text for toutiao', () => {
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
      ],
      imageBaseOrigin: 'https://app.example.com'
    });

    assert.ok(charLen(pack.title) <= 30);
    // 优先远程公网地址，便于外站粘贴
    assert.ok(pack.html.includes('https://cdn.example.com/a.jpg'));
    assert.ok(pack.html.includes('<img'));
    assert.equal(pack.preferEmbedImages, undefined);
    assert.ok(pack.text.includes('https://cdn.example.com/a.jpg'));
    assert.ok(pack.text.includes('[图片1'));
  });

  it('skips javascript image urls', () => {
    const pack = buildPlatformPack({
      templateName: '今日头条创作',
      output: '标题测试一二三四五六七八九十\n\n正文。',
      images: [{ url: 'javascript:alert(1)', caption: '坏图' }]
    });
    assert.equal(pack.html.includes('<img'), false);
    assert.equal(pack.html.includes('javascript:'), false);
  });

  it('keeps compact compliance note for xiaohongshu', () => {
    const pack = buildPlatformPack({
      templateName: '小红书创作',
      output:
        '种草标题\n\n正文一段。\n\n---\n【AI 生成说明】\n1. 本文正文由人工智能辅助生成。',
      images: [{ url: 'https://cdn.example.com/a.jpg', sourceType: 'ai', credit: 'AI 生成配图，非现场真实照片' }]
    });
    assert.match(pack.text, /AI 辅助生成/);
    assert.match(pack.text, /非现场实拍|AI 生成/);
    assert.ok(pack.text.includes('https://cdn.example.com/a.jpg'));
  });
});
