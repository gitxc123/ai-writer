import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLogViewerPhone,
  canViewLogs,
  clampLogLimit,
  serializeMeta,
  maskPhone,
  isRegisterLogTaskId,
  SYS_REGISTER_TASK_ID,
  DEFAULT_LOG_VIEWER_PHONE
} from '../src/lib/logger.js';

describe('log viewer phone', () => {
  it('defaults to ops phone when env unset', () => {
    const prev = process.env.LOG_VIEWER_PHONE;
    delete process.env.LOG_VIEWER_PHONE;
    assert.equal(getLogViewerPhone(), DEFAULT_LOG_VIEWER_PHONE);
    assert.equal(canViewLogs('17682160819'), true);
    assert.equal(canViewLogs('13900000000'), false);
    if (prev !== undefined) process.env.LOG_VIEWER_PHONE = prev;
  });

  it('respects LOG_VIEWER_PHONE override', () => {
    const prev = process.env.LOG_VIEWER_PHONE;
    process.env.LOG_VIEWER_PHONE = '13900000000';
    assert.equal(getLogViewerPhone(), '13900000000');
    assert.equal(canViewLogs('13900000000'), true);
    assert.equal(canViewLogs('17682160819'), false);
    if (prev === undefined) delete process.env.LOG_VIEWER_PHONE;
    else process.env.LOG_VIEWER_PHONE = prev;
  });
});

describe('register log module', () => {
  it('recognizes sys:register task id', () => {
    assert.equal(SYS_REGISTER_TASK_ID, 'sys:register');
    assert.equal(isRegisterLogTaskId('sys:register'), true);
    assert.equal(isRegisterLogTaskId('abc'), false);
  });
});

describe('maskPhone', () => {
  it('masks mainland mobile', () => {
    assert.equal(maskPhone('13812345678'), '138****5678');
  });
});

describe('clampLogLimit', () => {
  it('defaults to 100, caps at 200', () => {
    assert.equal(clampLogLimit(undefined), 100);
    assert.equal(clampLogLimit(0), 100);
    assert.equal(clampLogLimit(50), 50);
    assert.equal(clampLogLimit(999), 200);
  });
});

describe('serializeMeta', () => {
  it('returns null for empty, JSON for object', () => {
    assert.equal(serializeMeta(null), null);
    assert.equal(serializeMeta(undefined), null);
    assert.equal(serializeMeta({ imageIndex: 1 }), '{"imageIndex":1}');
  });
});
