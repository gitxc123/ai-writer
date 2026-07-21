import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiImageAttribution,
  buildImageAttribution,
  buildProductImageAttribution,
  buildTextAiAttribution,
  buildWebImageAttribution,
  withComplianceFooters,
  AI_IMAGE_CREDIT,
  AUDIENCE_LABEL_MARKER
} from '../src/lib/article-images.js';

describe('audience-facing attribution only', () => {
  it('labels AI images for readers without service-to-author disclaimers', () => {
    const footer = buildAiImageAttribution([
      { caption: '垮塌现场示意', credit: AI_IMAGE_CREDIT }
    ]);
    assert.match(footer, /【配图】/);
    assert.match(footer, /AI 生成配图，非现场真实照片/);
    assert.match(footer, /图1（垮塌现场示意）/);
    assert.equal(/责任|授权|本服务|请核实|请按平台/.test(footer), false);
  });

  it('routes ai source through buildImageAttribution', () => {
    const footer = buildImageAttribution('ai', [{ caption: '配图' }]);
    assert.match(footer, /AI 生成/);
  });

  it('attributes product images for readers only', () => {
    const footer = buildProductImageAttribution([{ caption: '特写' }]);
    assert.match(footer, /用户上传/);
    assert.equal(/责任|请确认/.test(footer), false);
  });

  it('lists web image sources without copyright lectures', () => {
    const footer = buildWebImageAttribution([
      {
        caption: '现场',
        credit: '某图库',
        sourceUrl: 'https://example.com/very/long/path/to/image?id=12345'
      }
    ]);
    assert.match(footer, /【配图】/);
    assert.match(footer, /某图库/);
    assert.equal(footer.includes('https://example.com'), false);
    assert.equal(/不授予版权|责任由发布者/.test(footer), false);
  });

  it('adds reader-facing AI label via withComplianceFooters', () => {
    const out = withComplianceFooters('标题\n\n正文', 'ai', [{ caption: '图', credit: AI_IMAGE_CREDIT }]);
    assert.match(out, new RegExp(AUDIENCE_LABEL_MARKER));
    assert.match(out, /【配图】/);
    assert.match(buildTextAiAttribution(), /人工智能辅助生成/);
    assert.equal(/责任由发布者|请核实事实/.test(out), false);
  });
});
