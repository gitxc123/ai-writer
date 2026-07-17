import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCoreSubjects,
  extractSearchAnchors,
  ensureQueryHasSubject,
  pickRelevantWebImages,
  detectTopicKind,
  TOPIC_KINDS
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

describe('web image news-event relevance', () => {
  it('detects disaster news topic kind', () => {
    assert.equal(detectTopicKind('重庆山体垮塌救援现场'), TOPIC_KINDS.NEWS);
  });

  it('extracts place and event anchors from disaster keyword', () => {
    const a = extractSearchAnchors('重庆山体垮塌');
    assert.equal(a.place, '重庆');
    assert.ok(/垮塌|滑坡|山体/.test(a.event));
    assert.ok(a.tokens.includes('重庆'));
  });

  it('forces place+event into drifted search query', () => {
    const q = ensureQueryHasSubject('救援现场 航拍', '重庆山体垮塌');
    assert.match(q, /重庆/);
    assert.match(q, /垮塌|滑坡|山体/);
  });

  it('keeps only photos matching place and disaster event', () => {
    const pool = [
      { url: 'a.jpg', alt: '美丽重庆夜景洪崖洞', _score: 8 },
      { url: 'b.jpg', alt: '重庆南岸区山体滑坡垮塌现场', _score: 1 },
      { url: 'c.jpg', alt: '某地山体滑坡航拍', _score: 6 },
      { url: 'd.jpg', alt: '舞台演唱会现场', _score: 9 }
    ];
    const picked = pickRelevantWebImages(pool, {
      keyword: '重庆山体垮塌',
      limit: 3
    });
    assert.deepEqual(
      picked.map((p) => p.url),
      ['b.jpg']
    );
  });

  it('does not fall back to unrelated images for news events', () => {
    const pool = [
      { url: 'a.jpg', alt: '时尚人像写真', _score: 9 },
      { url: 'b.jpg', alt: '城市夜景灯光秀', _score: 8 }
    ];
    const picked = pickRelevantWebImages(pool, {
      keyword: '重庆山体垮塌',
      limit: 2
    });
    assert.equal(picked.length, 0);
  });
});
