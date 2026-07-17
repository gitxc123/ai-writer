import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiImageAttribution,
  buildImageAttribution,
  buildProductImageAttribution,
  withComplianceFooters,
  AI_IMAGE_CREDIT,
  AI_TEXT_FOOTER_MARKER
} from '../src/lib/article-images.js';

describe('AI image attribution', () => {
  it('marks images as AI generated not real photos', () => {
    const footer = buildAiImageAttribution([
      { caption: '垮塌现场示意', credit: AI_IMAGE_CREDIT }
    ]);
    assert.match(footer, /【配图来源】/);
    assert.match(footer, /AI 生成配图，非现场真实照片/);
    assert.match(footer, /并非真实现场拍摄照片/);
    assert.match(footer, /图1（垮塌现场示意）/);
  });

  it('routes ai source through buildImageAttribution', () => {
    const footer = buildImageAttribution('ai', [{ caption: '配图' }]);
    assert.match(footer, /人工智能生成/);
  });

  it('attributes product images', () => {
    const footer = buildProductImageAttribution([{ caption: '特写' }]);
    assert.match(footer, /用户上传/);
    assert.match(footer, /人工智能生成或编辑/);
  });

  it('adds text AI label via withComplianceFooters', () => {
    const out = withComplianceFooters('标题\n\n正文', 'ai', [{ caption: '图', credit: AI_IMAGE_CREDIT }]);
    assert.match(out, new RegExp(AI_TEXT_FOOTER_MARKER));
    assert.match(out, /【配图来源】/);
  });
});
