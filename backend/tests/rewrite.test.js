import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ngramSimilarity,
  longestCommonRun,
  evaluateRewrite,
  findCopiedSentences,
  TARGET_SIMILARITY
} from '../src/lib/rewrite.js';

describe('rewrite similarity', () => {
  it('identical text scores high', () => {
    const t = '今天天气很好，适合出门散步看海。';
    assert.ok(ngramSimilarity(t, t) > 0.9);
  });

  it('fully different text scores low', () => {
    const a = '苹果价格上涨影响果汁加工成本。';
    const b = '地铁早高峰拥挤，建议错峰出行更舒适。';
    assert.ok(ngramSimilarity(a, b) < 0.35);
  });

  it('detects long shared run', () => {
    const a = 'abcdefghijklmnop';
    const b = 'zzzabcdefghijklmnyy';
    assert.ok(longestCommonRun(a, b) >= 10);
  });

  it('finds almost copied sentences', () => {
    const source = '用户应该每天坚持阅读半小时以提升表达能力。另外要多练习写作。';
    const bad = '大家可以做别的事。用户应该每天坚持阅读半小时以提升表达能力。然后喝茶。';
    const hits = findCopiedSentences(source, bad);
    assert.ok(hits.length >= 1);
  });

  it('evaluateRewrite fails on near copy', () => {
    const source =
      '智能手表能监测心率和睡眠，对上班族非常友好，续航也能支撑忙碌的一周。';
    const copy =
      '智能手表能监测心率和睡眠，对上班族非常友好，续航也能支撑忙碌的一周。再加一句废话。';
    const ev = evaluateRewrite(source, copy);
    assert.equal(ev.pass, false);
    assert.ok(ev.similarity >= TARGET_SIMILARITY || ev.sharedRun >= 24 || ev.copiedCount > 0);
  });

  it('evaluateRewrite passes on paraphrased content', () => {
    const source =
      '智能手表能监测心率和睡眠，对上班族非常友好，续航也能支撑忙碌的一周。';
    const rewritten =
      '一款腕上健康助手，把心跳波动和夜间作息记下来，特别适合通勤族；一块电池往往够用好几天。';
    const ev = evaluateRewrite(source, rewritten);
    assert.ok(ev.similarity < 0.55);
  });
});
