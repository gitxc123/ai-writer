/** 单图重新生成中的槽位（进程内） */
const regeneratingSlots = new Map();

export function getRegeneratingIndexes(taskId) {
  const set = regeneratingSlots.get(taskId);
  return set ? [...set].sort((a, b) => a - b) : [];
}

export function markSlotRegenerating(taskId, index, on) {
  let set = regeneratingSlots.get(taskId);
  if (!set) {
    set = new Set();
    regeneratingSlots.set(taskId, set);
  }
  if (on) set.add(index);
  else set.delete(index);
  if (!set.size) regeneratingSlots.delete(taskId);
}
