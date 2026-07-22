import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePayload } from '../src/lib/agnes-image.js';

describe('buildImagePayload', () => {
  it('with images sets extra_body.image and img2img model', () => {
    const payload = buildImagePayload({
      prompt: 'enhance product photo',
      size: 'square',
      images: ['https://cdn.example.com/ref.jpg']
    });

    assert.equal(payload.model, 'agnes-image-2.1-flash');
    assert.deepEqual(payload.extra_body.image, ['https://cdn.example.com/ref.jpg']);
    assert.equal(payload.extra_body.response_format, 'url');
    assert.equal(payload.size, '1024x1024');
    assert.match(payload.prompt, /enhance product photo/);
    assert.match(payload.prompt, /East Asian|Asian appearance/);
  });

  it('without images omits image key and keeps default model', () => {
    const payload = buildImagePayload({
      prompt: 'cover illustration',
      size: 'landscape'
    });

    assert.equal(payload.model, 'agnes-image-2.1-flash');
    assert.equal(payload.extra_body.image, undefined);
    assert.equal(payload.extra_body.response_format, 'url');
    assert.equal(payload.size, '1024x768');
    assert.match(payload.prompt, /cover illustration/);
    assert.match(payload.prompt, /East Asian|Asian appearance/);
  });

  it('does not duplicate Asian people constraint', () => {
    const once = buildImagePayload({ prompt: 'a person drinking coffee' }).prompt;
    const twice = buildImagePayload({ prompt: once }).prompt;
    const marker = 'all people must be East Asian';
    const count = twice.split(marker).length - 1;
    assert.equal(count, 1);
  });

  it('respects explicit model when images are provided', () => {
    const payload = buildImagePayload({
      prompt: 'edit',
      images: ['https://example.com/a.jpg'],
      model: 'agnes-image-2.1-flash'
    });

    assert.equal(payload.model, 'agnes-image-2.1-flash');
    assert.deepEqual(payload.extra_body.image, ['https://example.com/a.jpg']);
  });
});
