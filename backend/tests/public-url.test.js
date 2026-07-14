import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { resolveAgnesImageUrl, UPLOAD_DIR } from '../src/lib/public-url.js';

describe('resolveAgnesImageUrl', () => {
  it('passes through public https', async () => {
    const u = await resolveAgnesImageUrl('https://cdn.example.com/a.jpg');
    assert.equal(u, 'https://cdn.example.com/a.jpg');
  });

  it('passes through public http', async () => {
    const u = await resolveAgnesImageUrl('http://cdn.example.com/a.jpg');
    assert.equal(u, 'http://cdn.example.com/a.jpg');
  });

  it('rejects arbitrary filesystem paths', async () => {
    await assert.rejects(
      () => resolveAgnesImageUrl('C:\\Windows\\system32\\config'),
      /unsupported image URL/i
    );
  });

  it('rejects relative filesystem paths', async () => {
    await assert.rejects(
      () => resolveAgnesImageUrl('../secrets/key.pem'),
      /unsupported image URL/i
    );
  });

  it('rejects file: URLs outside upload directory', async () => {
    const outside = path.join(UPLOAD_DIR, '..', 'outside.jpg');
    const fileUrl = `file:///${outside.replace(/\\/g, '/')}`;
    await assert.rejects(
      () => resolveAgnesImageUrl(fileUrl),
      /file: URL must be under the upload directory/i
    );
  });
});

describe('resolveAgnesImageUrl PUBLIC_BASE_URL fallback', () => {
  let originalPublicBase;
  let originalFetch;
  let fetchCalls;

  before(() => {
    originalPublicBase = process.env.PUBLIC_BASE_URL;
    originalFetch = globalThis.fetch;
  });

  after(() => {
    if (originalPublicBase === undefined) {
      delete process.env.PUBLIC_BASE_URL;
    } else {
      process.env.PUBLIC_BASE_URL = originalPublicBase;
    }
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it('falls through to uguu when PUBLIC_BASE_URL is localhost', async () => {
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
    fetchCalls = [];

    globalThis.fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          success: true,
          files: [{ url: 'https://a.uguu.se/test.jpg' }]
        })
      };
    };

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const testFile = path.join(UPLOAD_DIR, 'localhost-fallback-test.jpg');
    fs.writeFileSync(testFile, Buffer.from('fake-image'));

    try {
      const u = await resolveAgnesImageUrl('/uploads/localhost-fallback-test.jpg');
      assert.equal(u, 'https://a.uguu.se/test.jpg');
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0].url, 'https://uguu.se/upload');
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  it('falls through to uguu when PUBLIC_BASE_URL is non-https', async () => {
    process.env.PUBLIC_BASE_URL = 'http://example.com';
    fetchCalls = [];

    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        json: async () => ({
          success: true,
          files: [{ url: 'https://a.uguu.se/http-base.jpg' }]
        })
      };
    };

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const testFile = path.join(UPLOAD_DIR, 'http-base-fallback-test.jpg');
    fs.writeFileSync(testFile, Buffer.from('fake-image'));

    try {
      const u = await resolveAgnesImageUrl('/uploads/http-base-fallback-test.jpg');
      assert.equal(u, 'https://a.uguu.se/http-base.jpg');
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0], 'https://uguu.se/upload');
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  it('uses PUBLIC_BASE_URL when it is a public https origin', async () => {
    process.env.PUBLIC_BASE_URL = 'https://cdn.example.com';

    const u = await resolveAgnesImageUrl('/uploads/product.jpg');
    assert.equal(u, 'https://cdn.example.com/uploads/product.jpg');
  });
});
