import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCoreSubjects,
  ensureQueryHasSubject,
  pickRelevantWebImages
} from '../src/lib/article-images.js';

describe('web image subject relevance', () => {
  it('extracts person name from celebrity event keyword', () => {
    const subjects = extractCoreSubjects('曲婉婷患癌');
    assert.ok(subjects.includes('曲婉婷'));
    assert.ok(subjects.includes('曲婉婷患癌'));
  });

  it('forces subject into search query when AI dropped the name', () => {
    const q = ensureQueryHasSubject('癌症患者医院资料图', '曲婉婷患癌');
    assert.match(q, /曲婉婷/);
  });

  it('keeps query when subject already present', () => {
    const q = ensureQueryHasSubject('曲婉婷 演唱会 现场', '曲婉婷患癌');
    assert.equal(q, '曲婉婷 演唱会 现场');
  });

  it('prefers photos whose title mentions the person', () => {
    const pool = [
      { url: 'a.jpg', alt: 'Hospital ward generic cancer care', _score: 2 },
      { url: 'b.jpg', alt: '歌手曲婉婷资料图', _score: 1 },
      { url: 'c.jpg', alt: '随机风景照片', _score: 5 }
    ];
    const picked = pickRelevantWebImages(pool, {
      keyword: '曲婉婷患癌',
      limit: 2
    });
    assert.equal(picked.length, 1);
    assert.equal(picked[0].url, 'b.jpg');
  });
});
