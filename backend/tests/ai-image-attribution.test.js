import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiImageAttribution,
  buildImageAttribution,
  buildProductImageAttribution,
  buildTextAiAttribution,
  buildWebImageAttribution,
  withComplianceFooters,
  AUTHOR_STATEMENT_AI,
  AUTHOR_STATEMENT_WEB,
  AUTHOR_STATEMENT_PRODUCT,
  AI_IMAGE_CREDIT
} from '../src/lib/article-images.js';

describe('author statements for audience', () => {
  it('uses formal AI statement', () => {
    const footer = buildAiImageAttribution([{ caption: '垮塌现场示意', credit: AI_IMAGE_CREDIT }]);
    assert.match(footer, /【作者声明】/);
    assert.ok(footer.includes(AUTHOR_STATEMENT_AI));
    assert.equal(footer.includes('图1'), false);
  });

  it('uses formal web statement', () => {
    const footer = buildWebImageAttribution([{ caption: '现场', credit: '某图库' }]);
    assert.ok(footer.includes(AUTHOR_STATEMENT_WEB));
    assert.match(footer, /网络公开检索/);
  });

  it('uses product statement', () => {
    const footer = buildProductImageAttribution([{ caption: '特写' }]);
    assert.ok(footer.includes(AUTHOR_STATEMENT_PRODUCT));
  });

  it('routes by imageSource', () => {
    assert.ok(buildImageAttribution('web', [{ caption: '配图' }]).includes(AUTHOR_STATEMENT_WEB));
    assert.ok(buildImageAttribution('ai', [{ caption: '配图' }]).includes(AUTHOR_STATEMENT_AI));
  });

  it('appends only author statement via withComplianceFooters', () => {
    const out = withComplianceFooters('标题\n\n正文', 'ai', [{ caption: '图', credit: AI_IMAGE_CREDIT }]);
    assert.equal(buildTextAiAttribution(), '');
    assert.ok(out.includes(AUTHOR_STATEMENT_AI));
    assert.equal(/责任由发布者|请核实事实/.test(out), false);
  });
});
