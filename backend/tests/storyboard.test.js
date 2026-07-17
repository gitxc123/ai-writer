import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoryboardPrompt,
  platformHint,
  isStoryboardTemplate,
  suggestMaxShots
} from '../src/lib/storyboard.js';

describe('storyboard prompt', () => {
  it('recognizes template name', () => {
    assert.equal(isStoryboardTemplate('故事分镜提示词'), true);
    assert.equal(isStoryboardTemplate('一键改文'), false);
  });

  it('includes platform-specific hint and story', () => {
    const prompt = buildStoryboardPrompt({
      story: '小明走在雨夜里，看见窗口亮起一盏灯，推门却发现房间空无一人。',
      platform: 'Midjourney',
      style: '暗黑悬疑',
      ratio: '9:16',
      duration: '5秒',
      cameraMove: '推镜头',
      requirements: '情绪偏压抑'
    });
    assert.match(prompt, /Midjourney/);
    assert.match(prompt, /--ar/);
    assert.match(prompt, /小明走在雨夜里/);
    assert.match(prompt, /9:16/);
    assert.match(prompt, /单镜时长/);
    assert.match(prompt, /5秒/);
    assert.match(prompt, /不是整片总时长/);
    assert.match(prompt, /推镜头/);
    assert.match(prompt, /分镜独立提示词/);
    assert.match(prompt, /完整提示词/);
    assert.match(prompt, /角色锁定/);
    assert.match(prompt, /自包含|独立完整/);
    assert.match(prompt, /镜头数 ≤ 6/);
  });

  it('caps shots by story length', () => {
    assert.equal(suggestMaxShots(100), 6);
    assert.equal(suggestMaxShots(800), 10);
    assert.equal(suggestMaxShots(5000), 14);
  });

  it('falls back to generic platform hint', () => {
    assert.match(platformHint('未知工具'), /通用/);
  });
});
