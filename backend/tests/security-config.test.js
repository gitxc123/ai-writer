import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProduction,
  resolveJwtSecret,
  isDemoPayEnabled,
  getDailyGenerateLimit,
  checkComplianceEnv
} from '../src/lib/security-config.js';

describe('resolveJwtSecret', () => {
  it('allows weak secret outside production with fallback', () => {
    const prevNode = process.env.NODE_ENV;
    const prevJwt = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const r = resolveJwtSecret();
    assert.equal(r.ok, true);
    assert.ok(r.secret);
    process.env.NODE_ENV = prevNode;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('rejects weak secret in production', () => {
    const prevNode = process.env.NODE_ENV;
    const prevJwt = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret';
    const r = resolveJwtSecret();
    assert.equal(r.ok, false);
    process.env.NODE_ENV = prevNode;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('accepts long secret in production', () => {
    const prevNode = process.env.NODE_ENV;
    const prevJwt = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const r = resolveJwtSecret();
    assert.equal(r.ok, true);
    assert.equal(r.secret.length, 32);
    process.env.NODE_ENV = prevNode;
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });
});

describe('isDemoPayEnabled', () => {
  it('defaults off in production', () => {
    const prevNode = process.env.NODE_ENV;
    const prev = process.env.ENABLE_DEMO_PAY;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEMO_PAY;
    assert.equal(isDemoPayEnabled(), false);
    process.env.NODE_ENV = prevNode;
    if (prev === undefined) delete process.env.ENABLE_DEMO_PAY;
    else process.env.ENABLE_DEMO_PAY = prev;
  });

  it('can force on with ENABLE_DEMO_PAY=1', () => {
    const prev = process.env.ENABLE_DEMO_PAY;
    process.env.ENABLE_DEMO_PAY = '1';
    assert.equal(isDemoPayEnabled(), true);
    if (prev === undefined) delete process.env.ENABLE_DEMO_PAY;
    else process.env.ENABLE_DEMO_PAY = prev;
  });
});

describe('getDailyGenerateLimit', () => {
  it('defaults to 30', () => {
    const prev = process.env.DAILY_GENERATE_LIMIT;
    delete process.env.DAILY_GENERATE_LIMIT;
    assert.equal(getDailyGenerateLimit(), 30);
    if (prev !== undefined) process.env.DAILY_GENERATE_LIMIT = prev;
  });
});

describe('checkComplianceEnv', () => {
  it('warns when placeholders missing but ok without STRICT', () => {
    const prevE = process.env.COMPLAINT_EMAIL;
    const prevA = process.env.ADMIN_TOKEN;
    const prevS = process.env.STRICT_SECURITY;
    delete process.env.COMPLAINT_EMAIL;
    delete process.env.ADMIN_TOKEN;
    delete process.env.STRICT_SECURITY;
    const r = checkComplianceEnv();
    assert.equal(r.ok, true);
    assert.ok(r.warnings.length >= 1);
    if (prevE !== undefined) process.env.COMPLAINT_EMAIL = prevE;
    if (prevA !== undefined) process.env.ADMIN_TOKEN = prevA;
    if (prevS !== undefined) process.env.STRICT_SECURITY = prevS;
  });
});

describe('isProduction', () => {
  it('reads NODE_ENV', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    assert.equal(isProduction(), true);
    process.env.NODE_ENV = 'development';
    assert.equal(isProduction(), false);
    process.env.NODE_ENV = prev;
  });
});
