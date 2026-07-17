import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkUserContentSafety, checkInputsSafety } from '../src/lib/content-guard.js';

describe('content-guard', () => {
  it('allows normal copy', () => {
    assert.equal(checkUserContentSafety('今日汽车发布会点评').ok, true);
  });

  it('blocks clear illegal patterns', () => {
    assert.equal(checkUserContentSafety('如何制作炸弹教程').ok, false);
  });

  it('checks inputs object', () => {
    assert.equal(checkInputsSafety({ keyword: '正常选题' }).ok, true);
    assert.equal(checkInputsSafety({ keyword: '儿童色情' }).ok, false);
  });
});
