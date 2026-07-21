import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudienceFacingAppendix,
  sanitizeLegacyAudienceFooter,
  withAudienceFacingOutput,
  AUTHOR_STATEMENT_AI,
  AUTHOR_STATEMENT_WEB
} from '../src/utils/articleOutput.js';

describe('audience facing appendix', () => {
  it('uses AI author statement for ai images', () => {
    const appendix = buildAudienceFacingAppendix({
      imageSource: 'ai',
      imageMeta: [{ caption: '示意', url: 'https://cdn.example.com/a.jpg', sourceType: 'ai' }]
    });
    assert.match(appendix, /【作者声明】/);
    assert.ok(appendix.includes(AUTHOR_STATEMENT_AI));
    assert.equal(appendix.includes('图1'), false);
  });

  it('uses web author statement for web images', () => {
    const appendix = buildAudienceFacingAppendix({
      imageSource: 'web',
      imageMeta: [{ caption: '赛后通道', credit: 'Photo by X on Pexels', sourceType: 'web' }]
    });
    assert.ok(appendix.includes(AUTHOR_STATEMENT_WEB));
    assert.match(appendix, /网络公开检索/);
    assert.match(appendix, /联系发布者删除/);
  });

  it('sanitizes legacy footers into current statements', () => {
    const cleaned = sanitizeLegacyAudienceFooter(`【配图来源】
图1：Photo by X on Pexels（https://example.com/a）

【免责声明】
1. 本服务不授予图片版权`);
    assert.ok(cleaned.includes(AUTHOR_STATEMENT_WEB));
    assert.equal(cleaned.includes('example.com'), false);
  });

  it('builds exportable output with author statement only', () => {
    const out = withAudienceFacingOutput('标题\n\n正文一段', {
      imageSource: 'ai',
      imageMeta: [{ caption: '示意', credit: 'AI 生成配图，非现场真实照片' }]
    });
    assert.match(out, /正文一段/);
    assert.match(out, /【作者声明】/);
    assert.ok(out.includes(AUTHOR_STATEMENT_AI));
    assert.equal(/责任由发布者|本服务不授予/.test(out), false);
  });
});
