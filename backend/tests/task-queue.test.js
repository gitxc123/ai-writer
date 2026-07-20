import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runWithTaskSlot, getTaskQueueStats, getMaxConcurrentTasks } from '../src/lib/task-queue.js';

describe('task-queue', () => {
  it('limits concurrent runners and drains waiters', async () => {
    assert.ok(getMaxConcurrentTasks() >= 1);
    let maxSeen = 0;
    let concurrent = 0;
    const n = getMaxConcurrentTasks() + 3;
    const jobs = Array.from({ length: n }, (_, i) =>
      runWithTaskSlot(`job-${i}`, async () => {
        concurrent += 1;
        maxSeen = Math.max(maxSeen, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      })
    );
    await Promise.all(jobs);
    assert.ok(maxSeen <= getMaxConcurrentTasks(), `max concurrent was ${maxSeen}`);
    assert.equal(getTaskQueueStats().active, 0);
    assert.equal(getTaskQueueStats().waiting, 0);
  });
});
