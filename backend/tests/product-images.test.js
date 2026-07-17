import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductPhotos,
  planProductImageJobs,
  buildRealUseScenes,
  normalizeDesignedJobs,
  reinforceJobPrompt,
  detectPromptLogicIssues,
  PRODUCT_IMAGE_TARGET
} from '../src/lib/product-images.js';
import { extractJsonBlock } from '../src/lib/ai.js';

describe('normalizeProductPhotos', () => {
  it('accepts 1–9 photos without fixed angles', () => {
    const photos = normalizeProductPhotos([
      { url: 'https://example.com/a.jpg' },
      { slot: 'any', url: 'https://example.com/b.jpg' }
    ]);
    assert.equal(photos.length, 2);
    assert.equal(photos[0].slot, 'ref-1');
    assert.equal(photos[1].slot, 'any');
  });

  it('caps at 9 photos', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      url: `https://example.com/${i}.jpg`
    }));
    const photos = normalizeProductPhotos(many);
    assert.equal(photos.length, 9);
  });

  it('rejects empty', () => {
    assert.throws(() => normalizeProductPhotos([]), /至少上传/);
  });
});

describe('buildRealUseScenes', () => {
  it('headphones scenes require wearing on ears and empty-case logic', () => {
    const scenes = buildRealUseScenes({ keyword: '降噪耳机', style: '上班族' });
    assert.equal(scenes.length, 2);
    assert.ok(scenes.every((s) => /ON THEIR EARS/i.test(s)));
    assert.ok(scenes.every((s) => /EMPTY|empty|closed/i.test(s)));
    assert.ok(scenes[0] !== scenes[1]);
  });

  it('juicer scenes are kitchen in-use', () => {
    const scenes = buildRealUseScenes({ keyword: '便携榨汁杯' });
    assert.ok(scenes.some((s) => /juic|blend|kitchen/i.test(s)));
  });
});

describe('planProductImageJobs', () => {
  it('plans 1 enhance + 2 closeups + 2 scenes', () => {
    const jobs = planProductImageJobs({
      photos: [{ slot: 'front', url: 'https://example.com/a.jpg' }],
      keyword: '陶瓷杯',
      style: '年轻白领'
    });
    const types = jobs.map((j) => j.type);
    assert.equal(types.filter((t) => t === 'enhanced').length, 1);
    assert.equal(types.filter((t) => t === 'closeup').length, 2);
    assert.equal(types.filter((t) => t === 'scene').length, 2);
    assert.equal(jobs.length, PRODUCT_IMAGE_TARGET);
    assert.ok(jobs.every((j) => j.refUrls?.length === 1));
    assert.ok(jobs.every((j) => /BRAND & TEXT LOCK/i.test(j.prompt)));
    assert.ok(jobs.every((j) => /QUALITY LOCK/i.test(j.prompt)));
  });

  it('earbud scenes reinforce physical case logic', () => {
    const jobs = planProductImageJobs({
      photos: [{ url: 'https://example.com/a.jpg' }],
      keyword: '无线耳机'
    });
    const scenes = jobs.filter((j) => j.type === 'scene');
    assert.ok(scenes.every((j) => /PHYSICAL LOGIC LOCK|EARBUD LOGIC|EMPTY/i.test(j.prompt)));
  });
});

describe('prompt logic helpers', () => {
  it('detects worn earbuds with case but no empty rule', () => {
    const issues = detectPromptLogicIssues(
      {
        type: 'scene',
        prompt: 'Person wearing earbuds on ears with open charging case nearby'
      },
      { keyword: '耳机' }
    );
    assert.ok(issues.includes('earbuds_worn_with_filled_case_risk'));
  });

  it('reinforceJobPrompt injects locks', () => {
    const job = reinforceJobPrompt(
      { type: 'enhanced', prompt: 'Make a nice product photo on white.' },
      { keyword: '耳机' }
    );
    assert.match(job.prompt, /IDENTITY LOCK/i);
    assert.match(job.prompt, /BRAND & TEXT LOCK/i);
    assert.match(job.prompt, /QUALITY LOCK/i);
  });
});

describe('normalizeDesignedJobs', () => {
  it('binds each designed job to exactly one photo and reinforces locks', () => {
    const photos = [
      { slot: 'a', url: 'https://example.com/a.jpg' },
      { slot: 'b', url: 'https://example.com/b.jpg' }
    ];
    const jobs = normalizeDesignedJobs(
      [
        {
          type: 'enhanced',
          photoIndex: 0,
          captionZh: '主图',
          prompt: 'Catalog hero on white backdrop, sharpen the product from reference.'
        },
        {
          type: 'closeup',
          photoIndex: 1,
          captionZh: '侧面',
          prompt: 'Three-quarter closeup of the same product, pure white seamless studio.'
        },
        {
          type: 'scene',
          photoIndex: 0,
          captionZh: '场景',
          prompt: 'Person using this exact product in daily commute, photorealistic lifestyle.'
        },
        {
          type: 'closeup',
          photoIndex: 0,
          captionZh: '细节',
          prompt: 'Macro detail of logo area on pure white seamless studio backdrop.'
        }
      ],
      photos,
      { keyword: '蓝牙耳机' }
    );
    assert.ok(jobs.length >= 4);
    assert.ok(jobs.every((j) => j.refUrls.length === 1));
    assert.ok(jobs.every((j) => /IDENTITY LOCK/i.test(j.prompt)));
    assert.ok(jobs.every((j) => /BRAND & TEXT LOCK/i.test(j.prompt)));
  });

  it('falls back to rule plan when design is too thin', () => {
    const photos = [{ url: 'https://example.com/a.jpg' }];
    const jobs = normalizeDesignedJobs([{ type: 'enhanced', photoIndex: 0, prompt: 'x' }], photos, {
      keyword: '杯'
    });
    assert.equal(jobs.length, PRODUCT_IMAGE_TARGET);
  });
});

describe('extractJsonBlock', () => {
  it('parses fenced json', () => {
    const data = extractJsonBlock('here\n```json\n{"a":1}\n```\n');
    assert.equal(data.a, 1);
  });
});
