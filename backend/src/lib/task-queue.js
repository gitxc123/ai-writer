/**
 * 全局任务并发槽：多人同时提交时排队，避免瞬时打满 Agnes / 搜图 / SQLite。
 * 环境变量 MAX_CONCURRENT_TASKS，默认 3，范围 1–8。
 */

function clampInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getMaxConcurrentTasks() {
  return clampInt(process.env.MAX_CONCURRENT_TASKS, 3, 1, 8);
}

let activeCount = 0;
const waiters = [];

export function getTaskQueueStats() {
  return {
    max: getMaxConcurrentTasks(),
    active: activeCount,
    waiting: waiters.length
  };
}

/**
 * 获取一个执行槽；若已满则排队等待。
 * @returns {Promise<() => void>} release 函数，必须调用一次
 */
export function acquireTaskSlot() {
  const max = getMaxConcurrentTasks();
  return new Promise((resolve) => {
    const grant = () => {
      activeCount += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeCount = Math.max(0, activeCount - 1);
        const next = waiters.shift();
        if (next) next();
      });
    };

    if (activeCount < max) {
      grant();
    } else {
      waiters.push(grant);
    }
  });
}

/** 在全局槽内执行；结束后自动释放 */
export async function runWithTaskSlot(label, fn) {
  const waiting = activeCount >= getMaxConcurrentTasks();
  if (waiting) {
    console.log(
      '[task-queue] waiting',
      label || '',
      `active=${activeCount}/${getMaxConcurrentTasks()}`,
      `queue=${waiters.length}`
    );
  }
  const release = await acquireTaskSlot();
  try {
    if (waiting) {
      console.log('[task-queue] acquired', label || '', getTaskQueueStats());
    }
    return await fn();
  } finally {
    release();
  }
}
