import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  imageUrlDedupKey,
  filterExcludedImages
} from '../src/lib/article-images.js';

describe('web image dedupe', () => {
  it('treats same bing id as duplicate across hosts', () => {
    const a =
      'https://tse1.mm.bing.net/th?id=OX_zANrB-ugoVxNzHPir0UXsyG9pUv282Okq-VHhxsQc8AA&w=200';
    const b =
      'https://tse2.mm.bing.net/th?id=OX_zANrB-ugoVxNzHPir0UXsyG9pUv282Okq-VHhxsQc8AA&w=400';
    assert.equal(imageUrlDedupKey(a), imageUrlDedupKey(b));
  });

  it('filters already used images from pool', () => {
    const used = [
      'https://cdn.example.com/om_ls/OX_zANrB-ugoVxNzHPir0UXsyG9pUv282Okq-VHhxsQc8AA/0'
    ];
    const pool = [
      { url: 'https://cdn.example.com/om_ls/OX_zANrB-ugoVxNzHPir0UXsyG9pUv282Okq-VHhxsQc8AA/0' },
      { url: 'https://cdn.example.com/om_ls/OTHER_IMAGE_ID_HERE_1234567890/0' },
      { url: 'https://images.example.com/photo-unique-abc.jpg' }
    ];
    const left = filterExcludedImages(pool, used);
    assert.equal(left.length, 2);
    assert.ok(left.every((p) => !p.url.includes('OX_zANrB')));
  });
});
