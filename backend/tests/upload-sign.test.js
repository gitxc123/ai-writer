import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUploadSignature,
  verifyUploadSignature,
  withUploadSignature,
  uploadsRequireSignature
} from '../src/lib/upload-sign.js';

describe('upload-sign', () => {
  it('creates and verifies signatures', () => {
    const { exp, sig } = createUploadSignature('a.webp', 3600);
    assert.equal(verifyUploadSignature('a.webp', exp, sig), true);
    assert.equal(verifyUploadSignature('a.webp', exp, 'bad'), false);
    assert.equal(verifyUploadSignature('b.webp', exp, sig), false);
  });

  it('withUploadSignature appends query when required', () => {
    const prevNode = process.env.NODE_ENV;
    const prevPub = process.env.UPLOADS_PUBLIC;
    const prevReq = process.env.UPLOADS_REQUIRE_SIGN;
    process.env.NODE_ENV = 'production';
    delete process.env.UPLOADS_PUBLIC;
    process.env.UPLOADS_REQUIRE_SIGN = '1';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters!!';

    assert.equal(uploadsRequireSignature(), true);
    const signed = withUploadSignature('/uploads/demo.webp');
    assert.match(signed, /^\/uploads\/demo\.webp\?e=\d+&s=[a-f0-9]+$/);

    process.env.NODE_ENV = prevNode;
    if (prevPub === undefined) delete process.env.UPLOADS_PUBLIC;
    else process.env.UPLOADS_PUBLIC = prevPub;
    if (prevReq === undefined) delete process.env.UPLOADS_REQUIRE_SIGN;
    else process.env.UPLOADS_REQUIRE_SIGN = prevReq;
  });

  it('skips signing when UPLOADS_PUBLIC=1', () => {
    const prev = process.env.UPLOADS_PUBLIC;
    process.env.UPLOADS_PUBLIC = '1';
    assert.equal(withUploadSignature('/uploads/demo.webp'), '/uploads/demo.webp');
    if (prev === undefined) delete process.env.UPLOADS_PUBLIC;
    else process.env.UPLOADS_PUBLIC = prev;
  });
});
