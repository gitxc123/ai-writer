import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_ACTIVATION_CODE,
  ACTIVATION_CODE_DAYS,
  isValidMasterActivationCode,
  resolveActivationExpiry,
  calcExpireAt
} from '../src/lib/membership.js';

describe('activation code', () => {
  it('accepts master code with trim', () => {
    assert.equal(MASTER_ACTIVATION_CODE, 'admin666666');
    assert.equal(ACTIVATION_CODE_DAYS, 3);
    assert.equal(isValidMasterActivationCode('admin666666'), true);
    assert.equal(isValidMasterActivationCode('  admin666666  '), true);
    assert.equal(isValidMasterActivationCode('wrong'), false);
  });

  it('starts from now when not a member', () => {
    const now = new Date('2026-07-17T10:00:00.000Z');
    const r = resolveActivationExpiry({ memberPlan: 'none' }, 3, now);
    assert.equal(r.error, undefined);
    assert.equal(r.expireAt.toISOString(), calcExpireAt(now, 3).toISOString());
  });

  it('extends from current expiry when still active', () => {
    const now = new Date('2026-07-17T10:00:00.000Z');
    const expire = new Date('2026-07-20T10:00:00.000Z');
    const r = resolveActivationExpiry(
      { memberPlan: 'trial', memberExpireAt: expire },
      3,
      now
    );
    assert.equal(r.expireAt.toISOString(), calcExpireAt(expire, 3).toISOString());
  });

  it('rejects lifetime members', () => {
    const r = resolveActivationExpiry({ memberPlan: 'lifetime' }, 3, new Date());
    assert.equal(r.status, 400);
    assert.match(r.error, /永久/);
  });

  it('supports lifetime grant when days is 0', () => {
    const r = resolveActivationExpiry({ memberPlan: 'none' }, 0, new Date());
    assert.equal(r.lifetime, true);
    assert.equal(r.expireAt, null);
  });
});
