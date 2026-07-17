import { toUserErrorMessage } from './userError.js';

export const STATUS_MAP = {
  pending: { label: '排队中', class: 'status-pending' },
  processing: { label: '生成中', class: 'status-processing' },
  completed: { label: '已完成', class: 'status-completed' },
  failed: { label: '失败', class: 'status-failed' },
  removed: { label: '已下架', class: 'status-failed' }
};

export function getStatusMeta(status) {
  return STATUS_MAP[status] || STATUS_MAP.pending;
}

export function getTaskTitle(item) {
  if (item.taskType === 'image') {
    const parentName = item.parent?.template?.name || item.template?.name || '文案';
    return `配图 · ${parentName}`;
  }
  if (item.taskType === 'combo') {
    const count = item.imageUrls?.length || item.imageCount || 0;
    const name = item.template?.name || '文案';
    const sourceLabel = item.imageSource === 'web' ? '网络搜图' : 'AI配图';
    return count > 0 ? `图文 · ${name} · ${sourceLabel}` : name;
  }
  return item.template?.name || '文案生成';
}

export function getTaskIcon(item) {
  if (item.taskType === 'image') return '🖼️';
  if (item.taskType === 'combo') return '📰';
  return item.template?.icon || '📝';
}

export function isRunning(status) {
  return status === 'pending' || status === 'processing';
}

export function getPreviewText(item) {
  if (item.status === 'removed') {
    return '内容已下架（投诉或合规处理）';
  }
  if (item.status === 'failed') {
    return toUserErrorMessage(item.error, '生成失败，请稍后重试');
  }
  if (item.error && /文案已完成/.test(item.error) && item.status === 'completed') {
    return item.error;
  }
  if (isRunning(item.status)) {
    if (item.taskType === 'combo' && item.output) {
      const done = item.imageUrls?.length || 0;
      const total = item.imageCount || item.input?.imageCount || done;
      return total > 0 ? `文案已完成，配图生成中 (${done}/${total})...` : '文案生成中，请稍候...';
    }
    return '任务处理中，请稍候...';
  }
  if (item.taskType === 'image') return item.imageUrl ? '配图已生成，点击查看' : item.output || '配图任务';
  if (item.taskType === 'combo' && item.imageUrls?.length) {
    if (item.error && /部分完成|配图完成/.test(item.error)) return item.error;
    const source =
      item.imageSource === 'web'
        ? '网络现场图'
        : item.imageSource === 'product'
          ? '产品实拍图'
          : 'AI配图';
    return `图文已完成 · ${item.imageUrls.length} 张${source}`;
  }
  return item.outputPreview || item.output
    ? `${String(item.outputPreview || item.output).slice(0, 80)}...`
    : '暂无内容';
}
