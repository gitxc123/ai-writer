import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAudienceFacingAppendix,
  sanitizeLegacyAudienceFooter,
  withAudienceFacingOutput
} from '../src/utils/articleOutput.js';

describe('audience facing appendix', () => {
  it('rebuilds short labels from imageMeta and drops urls', () => {
    const appendix = buildAudienceFacingAppendix({
      imageSource: 'web',
      imageMeta: [
        {
          caption: '赛后通道',
          credit: 'Photo by ANH LÊ on Pexels（https://www.pexels.com/photo/123）',
          sourceType: 'web'
        }
      ],
      legacyFooter: '【配图来源】\n图1：x\n\n【免责声明】\n1. 本服务不授予版权'
    });
    assert.match(appendix, /【标识】/);
    assert.match(appendix, /【配图】/);
    assert.match(appendix, /赛后通道/);
    assert.equal(appendix.includes('pexels.com'), false);
    assert.equal(appendix.includes('免责声明'), false);
    assert.equal(appendix.includes('不授予版权'), false);
  });

  it('sanitizes legacy footers', () => {
    const legacy = `【AI 生成说明】
1. 本文正文由人工智能辅助生成
2. 发布前请自行核实
3. 责任由内容发布者自行承担。

【配图来源】
图1（现场）：Photo by X（https://example.com/a）

【免责声明】
1. 本服务不授予图片版权
2. 发布前须自行取得授权`;
    const cleaned = sanitizeLegacyAudienceFooter(legacy);
    assert.match(cleaned, /【标识】|【配图】/);
    assert.equal(cleaned.includes('免责声明'), false);
    assert.equal(cleaned.includes('example.com'), false);
    assert.equal(/责任由|不授予/.test(cleaned), false);
  });

  it('builds exportable output without service lectures', () => {
    const out = withAudienceFacingOutput('标题\n\n正文一段', {
      imageSource: 'ai',
      imageMeta: [{ caption: '示意', credit: 'AI 生成配图，非现场真实照片' }]
    });
    assert.match(out, /正文一段/);
    assert.match(out, /【标识】/);
    assert.match(out, /【配图】/);
    assert.equal(/责任由发布者|本服务不授予/.test(out), false);
  });
});
