import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFallbackModes,
  isRetryableAIError,
  resolveProviderConfig
} from '../src/lib/ai.js';

describe('AI fallback config', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of [
      'AI_MODE',
      'AI_FALLBACK_MODE',
      'AI_API_KEY',
      'AI_FALLBACK_API_KEY',
      'DEEPSEEK_API_KEY',
      'AI_BASE_URL',
      'AI_MODEL',
      'AI_FALLBACK_BASE_URL',
      'AI_FALLBACK_MODEL'
    ]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults to DeepSeek when primary is agnes', () => {
    assert.deepEqual(getFallbackModes('agnes'), ['api']);
  });

  it('can disable fallback', () => {
    process.env.AI_FALLBACK_MODE = 'off';
    assert.deepEqual(getFallbackModes('agnes'), []);
  });

  it('supports comma-separated fallback chain', () => {
    process.env.AI_FALLBACK_MODE = 'api,ollama';
    assert.deepEqual(getFallbackModes('agnes'), ['api', 'ollama']);
  });

  it('skips primary from fallback list', () => {
    process.env.AI_FALLBACK_MODE = 'agnes,api';
    assert.deepEqual(getFallbackModes('agnes'), ['api']);
  });

  it('resolves separate fallback DeepSeek credentials', () => {
    process.env.AI_API_KEY = 'agnes-key';
    process.env.AI_FALLBACK_API_KEY = 'deepseek-key';
    const primary = resolveProviderConfig('agnes');
    const fallback = resolveProviderConfig('api', { asFallback: true });
    assert.equal(primary.apiKey, 'agnes-key');
    assert.equal(fallback.apiKey, 'deepseek-key');
    assert.equal(fallback.model, 'deepseek-chat');
    assert.match(fallback.baseURL, /deepseek\.com/);
  });

  it('treats network and 5xx as retryable', () => {
    assert.equal(isRetryableAIError({ message: 'fetch failed' }), true);
    assert.equal(isRetryableAIError({ status: 503 }), true);
    assert.equal(isRetryableAIError({ status: 429 }), true);
    assert.equal(isRetryableAIError({ status: 401 }), true);
  });
});
