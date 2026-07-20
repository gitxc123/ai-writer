import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractUploadPath, attachUploadPaths } from '../src/lib/upload-sign.js';

describe('extractUploadPath', () => {
  it('extracts from relative path', () => {
    assert.equal(extractUploadPath('/uploads/abc.jpg'), '/uploads/abc.jpg');
    assert.equal(extractUploadPath('/uploads/abc.jpg?e=1&s=x'), '/uploads/abc.jpg');
  });

  it('extracts from absolute signed url', () => {
    assert.equal(
      extractUploadPath('https://example.com/uploads/foo.png?e=99&s=sig'),
      '/uploads/foo.png'
    );
  });

  it('returns null for external urls', () => {
    assert.equal(extractUploadPath('https://cdn.example.com/a.jpg'), null);
  });
});

describe('attachUploadPaths', () => {
  it('adds path fields for list items', () => {
    const r = attachUploadPaths({
      imageUrl: '/uploads/a.jpg?e=1&s=x',
      imageUrls: ['/uploads/a.jpg?e=1&s=x', 'https://cdn/x.png'],
      imageMeta: [{ url: '/uploads/b.jpg?e=2&s=y', type: 'scene' }]
    });
    assert.equal(r.imageUrlPath, '/uploads/a.jpg');
    assert.deepEqual(r.imagePaths, ['/uploads/a.jpg']);
    assert.equal(r.imageMeta[0].path, '/uploads/b.jpg');
  });
});
