import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiImageAttribution,
  buildImageAttribution,
  AI_IMAGE_CREDIT
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
});
