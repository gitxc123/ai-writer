import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductPhotos,
  planProductImageJobs
} from '../src/lib/product-images.js';

describe('normalizeProductPhotos', () => {
  it('accepts 1–3 photos with slots', () => {
    const photos = normalizeProductPhotos([
      { slot: 'front', url: 'https://example.com/a.jpg' }
    ]);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].slot, 'front');
  });

  it('rejects empty', () => {
    assert.throws(() => normalizeProductPhotos([]), /至少上传/);
  });
});

describe('planProductImageJobs', () => {
  it('plans enhance + 2-3 closeups + 2 scenes', () => {
    const jobs = planProductImageJobs({
      photos: [{ slot: 'front', url: 'https://example.com/a.jpg' }],
      keyword: '陶瓷杯',
      style: '年轻白领'
    });
    const types = jobs.map((j) => j.type);
    assert.ok(types.filter((t) => t === 'enhanced').length === 1);
    assert.ok(types.filter((t) => t === 'closeup').length >= 2);
    assert.ok(types.filter((t) => t === 'scene').length === 2);
    assert.ok(jobs.every((j) => j.prompt && j.refUrls?.length));
  });
});
