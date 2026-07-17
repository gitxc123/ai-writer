import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toUserErrorMessage } from '../src/lib/user-error.js';
import { formatAIError } from '../src/lib/ai.js';

describe('user-facing errors', () => {
  it('hides ServiceUnavailable technical payload', () => {
    const raw =
      "AI 调用失败: ***.ServiceUnavailableError: ServiceUnavailableError: OpenAIException - Error code: 503 - {'detail': 'Service busy (id: req_9f7eb5c820774ba0846a8b1c5598fc99)'}";
    assert.equal(toUserErrorMessage(raw), '服务繁忙，请稍后再试');
  });

  it('maps formatAIError 503', () => {
    const msg = formatAIError({
      status: 503,
      message: "OpenAIException - Error code: 503 - {'detail': 'Service busy'}"
    });
    assert.equal(msg, '服务繁忙，请稍后再试');
  });

  it('keeps partial-success notes', () => {
    assert.match(toUserErrorMessage('配图完成 3 张（任务超时，其余未出齐）'), /配图完成/);
  });
});
