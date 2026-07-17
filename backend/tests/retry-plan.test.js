import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRetryPlan, TASK_STATUS } from '../src/lib/task-runner.js';

describe('getRetryPlan', () => {
  it('retries images when text done but images missing', () => {
    const plan = getRetryPlan({
      status: TASK_STATUS.COMPLETED,
      output: '一篇文案',
      error: '文案已完成，配图失败（服务繁忙），可先复制文案',
      input: JSON.stringify({ imageCount: 3, imageSource: 'ai' }),
      imageUrls: '[]'
    });
    assert.equal(plan.mode, 'images');
    assert.equal(plan.label, '重试配图');
  });

  it('retries images when some images already exist', () => {
    const plan = getRetryPlan({
      status: TASK_STATUS.COMPLETED,
      output: '一篇文案',
      error: '配图完成 1/3 张，2 张因服务繁忙未出',
      input: JSON.stringify({ imageCount: 3 }),
      imageUrls: JSON.stringify(['https://a.com/1.png'])
    });
    assert.equal(plan.mode, 'images');
    assert.equal(plan.done, 1);
    assert.equal(plan.expected, 3);
  });

  it('full retry when no output', () => {
    const plan = getRetryPlan({
      status: TASK_STATUS.FAILED,
      output: '',
      error: '服务繁忙，请稍后再试',
      input: JSON.stringify({ imageCount: 2 }),
      imageUrls: null
    });
    assert.equal(plan.mode, 'full');
    assert.equal(plan.label, '重新提交');
  });

  it('no retry while running', () => {
    assert.equal(
      getRetryPlan({
        status: TASK_STATUS.PROCESSING,
        output: 'x',
        input: JSON.stringify({ imageCount: 2 }),
        imageUrls: '[]'
      }),
      null
    );
  });
});
