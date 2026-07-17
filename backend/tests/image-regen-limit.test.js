import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGE_REGEN_PER_SLOT,
  getImageRegenCount,
  getImageRegenRemaining,
  buildImageRegenInfo
} from '../src/lib/task-runner.js';

describe('image regen limits', () => {
  it('defaults max to 3', () => {
    assert.equal(MAX_IMAGE_REGEN_PER_SLOT, 3);
  });

  it('computes remaining from meta', () => {
    assert.equal(getImageRegenCount({}), 0);
    assert.equal(getImageRegenRemaining({}), 3);
    assert.equal(getImageRegenCount({ regenCount: 2 }), 2);
    assert.equal(getImageRegenRemaining({ regenCount: 2 }), 1);
    assert.equal(getImageRegenRemaining({ regenCount: 3 }), 0);
    assert.equal(getImageRegenRemaining({ regenCount: 99 }), 0);
  });

  it('builds per-slot info', () => {
    const info = buildImageRegenInfo([{ regenCount: 1 }, { regenCount: 3 }], ['a', 'b']);
    assert.equal(info.max, 3);
    assert.deepEqual(info.used, [1, 3]);
    assert.deepEqual(info.remaining, [2, 0]);
  });
});
