import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorsOptions } from '../src/lib/cors-config.js';

function allowOrigin(options, origin) {
  return new Promise((resolve) => {
    options.origin(origin, (_err, allowed) => resolve(!!allowed));
  });
}

describe('buildCorsOptions', () => {
  it('allows configured origin and blocks others in production', async () => {
    const prevNode = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGINS;
    const prevPublic = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.example.com';
    delete process.env.PUBLIC_BASE_URL;

    const opts = buildCorsOptions();
    assert.equal(await allowOrigin(opts, 'https://app.example.com'), true);
    assert.equal(await allowOrigin(opts, 'https://evil.example.com'), false);
    assert.equal(await allowOrigin(opts, undefined), true);

    process.env.NODE_ENV = prevNode;
    if (prevCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCors;
    if (prevPublic === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prevPublic;
  });

  it('allows localhost in non-production', async () => {
    const prevNode = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGINS;

    const opts = buildCorsOptions();
    assert.equal(await allowOrigin(opts, 'http://localhost:5173'), true);

    process.env.NODE_ENV = prevNode;
    if (prevCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCors;
  });

  it('fail-closes empty whitelist in production', async () => {
    const prevNode = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGINS;
    const prevPublic = process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGINS;
    delete process.env.PUBLIC_BASE_URL;

    const opts = buildCorsOptions();
    assert.equal(await allowOrigin(opts, 'https://evil.example.com'), false);
    assert.equal(await allowOrigin(opts, undefined), true);

    process.env.NODE_ENV = prevNode;
    if (prevCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCors;
    if (prevPublic === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prevPublic;
  });
});
