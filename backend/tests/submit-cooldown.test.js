import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSubmitCooldown,
  markSubmitCooldown,
  clearSubmitCooldown,
  pickQualityTip,
  QUALITY_TIPS,
  QUALITY_TIP_FROM_COUNT,
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
    assert.equal(QUALITY_TIP_FROM_COUNT, 11);
    assert.ok(QUALITY_TIPS.length >= 3);
  });
});

describe('pickQualityTip', () => {
  it('stays silent before 11th', () => {
    assert.equal(pickQualityTip(1), null);
    assert.equal(pickQualityTip(10), null);
  });

  it('starts at 11th and rotates', () => {
    assert.equal(pickQualityTip(11), QUALITY_TIPS[0]);
    assert.equal(pickQualityTip(12), QUALITY_TIPS[1]);
    assert.equal(pickQualityTip(11 + QUALITY_TIPS.length), QUALITY_TIPS[0]);
  });
});
