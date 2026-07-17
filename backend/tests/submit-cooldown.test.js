import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSubmitCooldown,
  markSubmitCooldown,
  clearSubmitCooldown,
  QUALITY_OVER_QUANTITY_TIP,
  DEFAULT_SUBMIT_COOLDOWN_MS
} from '../src/lib/submit-cooldown.js';

describe('submit cooldown', () => {
  beforeEach(() => {
    clearSubmitCooldown('u1');
  });

  it('allows first submit', () => {
    assert.equal(checkSubmitCooldown('u1', 5000), null);
  });

  it('blocks within window', () => {
    markSubmitCooldown('u1');
    const hit = checkSubmitCooldown('u1', 5000);
    assert.ok(hit);
    assert.ok(hit.retryAfterSec >= 1);
    assert.match(hit.message, /秒后再试/);
  });

  it('exports tip copy', () => {
    assert.equal(DEFAULT_SUBMIT_COOLDOWN_MS, 5000);
    assert.match(QUALITY_OVER_QUANTITY_TIP, /精而不靠多/);
  });
});
