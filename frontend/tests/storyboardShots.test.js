import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStoryboardShots } from '../src/utils/storyboardShots.js';

describe('parseStoryboardShots', () => {
  it('extracts independent prompts per shot', () => {
    const raw = `## 一、镜头索引
- 主题：测试

## 二、分镜独立提示词
### 镜头 1｜开箱
- 对应原文：打开鞋盒
- 完整提示词：一位30岁短发女性，穿米色毛衣，在老屋衣柜前缓缓打开尘封鞋盒，暖黄侧光，近景慢推，时长约10秒，画幅9:16
- 负面提示：无字幕
- 参数建议：默认

### 镜头 2｜翻看账本
- 完整提示词：同一位30岁短发女性，穿米色毛衣，低头翻看泛黄记账本，特写手指与字迹，窗外雨光，时长约10秒，画幅9:16
- 参数建议：默认
`;
    const shots = parseStoryboardShots(raw);
    assert.equal(shots.length, 2);
    assert.equal(shots[0].id, 1);
    assert.match(shots[0].prompt, /打开尘封鞋盒/);
    assert.match(shots[1].prompt, /翻看泛黄记账本/);
    assert.ok(!shots[0].prompt.includes('负面提示'));
  });
});
