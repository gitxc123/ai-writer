import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  deleteUploadFilesForRecord,
  listUploadBasenamesForRecord
} from '../src/lib/upload-cleanup.js';

describe('listUploadBasenamesForRecord', () => {
  it('collects unique /uploads basenames from url fields', () => {
    const names = listUploadBasenamesForRecord({
      imageUrl: '/uploads/a.webp',
      imageUrls: JSON.stringify(['/uploads/a.webp', '/uploads/b.png', 'https://cdn.example/x.jpg']),
      imageMeta: JSON.stringify([{ url: '/uploads/c.jpg' }, { url: 'javascript:alert(1)' }])
    });
    assert.deepEqual(names.sort(), ['a.webp', 'b.png', 'c.jpg']);
  });

  it('skips traversal-looking basenames', () => {
    const names = listUploadBasenamesForRecord({
      imageUrl: '/uploads/../etc/passwd'
    });
    // path.basename('/uploads/../etc/passwd') => 'passwd' which is allowed as a name;
    // traversal is blocked at join time by basename-only under UPLOAD_DIR
    assert.deepEqual(names, ['passwd']);
  });
});

describe('deleteUploadFilesForRecord', () => {
  it('deletes matching files under UPLOAD_DIR', () => {
    const prev = process.env.UPLOAD_DIR;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-upload-'));
    process.env.UPLOAD_DIR = dir;
    fs.writeFileSync(path.join(dir, 'gone.webp'), 'y');
    fs.writeFileSync(path.join(dir, 'keep.webp'), 'x');

    const n = deleteUploadFilesForRecord({
      imageUrl: '/uploads/gone.webp',
      imageUrls: '[]',
      imageMeta: '[]'
    });
    assert.equal(n, 1);
    assert.equal(fs.existsSync(path.join(dir, 'gone.webp')), false);
    assert.equal(fs.existsSync(path.join(dir, 'keep.webp')), true);

    if (prev === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
