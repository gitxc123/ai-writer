import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgnesImageUrl } from '../src/lib/public-url.js';

describe('resolveAgnesImageUrl', () => {
  it('passes through public https', async () => {
    const u = await resolveAgnesImageUrl('https://cdn.example.com/a.jpg');
    assert.equal(u, 'https://cdn.example.com/a.jpg');
  });
});
