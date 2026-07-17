/** 产品名称关键词 → 关联卖点选项 */
const SELLING_POINT_MAP = [
  {
    keys: ['榨汁', '果汁', '搅拌机', '破壁'],
    points: ['30秒出汁', '可水洗', '便携随身', '静音设计', '易清洗', '营养锁鲜', '一键操作']
  },
  {
    keys: ['耳机', '降噪', '蓝牙耳机', '耳塞'],
    points: ['主动降噪', '长续航', '低延迟', '舒适佩戴', '通话清晰', '轻巧便携', '快速充电']
  },
  {
    keys: ['洗发', '洗护', '护发素', '氨基酸'],
    points: ['温和不刺激', '控油蓬松', '修护受损', '香氛持久', '孕妇可用', '无硅油', '氨基酸配方']
  },
  {
    keys: ['保温', '保温杯', '水杯', '水壶'],
    points: ['24小时保温', '防漏设计', '轻量大容量', '316不锈钢', '杯盖可喝水', '易携带', '保温锁冷']
  },
  {
    keys: ['筋膜', '按摩枪', '按摩仪'],
    points: ['深层放松', '多档调节', '静音马达', '便携收纳', '多种枪头', '长续航', '肌肉恢复']
  },
  {
    keys: ['空气炸锅', '炸锅', '烤箱'],
    points: ['少油更健康', '大容量', '智能菜单', '易清洗', '均匀受热', '可视窗口', '一键烹饪']
  },
  {
    keys: ['面霜', '护肤', '精华', '面膜', '防晒'],
    points: ['补水保湿', '清爽不油腻', '敏感肌可用', '修护屏障', '成分透明', '吸收快', '提亮肤色']
  },
  {
    keys: ['鼠标', '键盘', '键鼠'],
    points: ['静音按键', '人体工学', '无线连接', '长续航', '精准操控', '即插即用', '多设备切换']
  },
  {
    keys: ['吸尘器', '扫地', '清洁'],
    points: ['强劲吸力', '轻便省力', '除螨灭菌', '无线自由', '续航持久', '全能刷头', '易倒尘']
  },
  {
    keys: ['台灯', '灯光', '护眼'],
    points: ['护眼无频闪', '多档调光', '智能感应', '柔和不刺眼', '节能省电', '书桌办公', 'USB充电']
  }
];

const DEFAULT_POINTS = [
  '高性价比',
  '品质可靠',
  '设计好看',
  '使用简单',
  '售后无忧',
  '口碑好评',
  '轻巧便携'
];

export function getSellingPointOptions(productName) {
  const name = String(productName || '').trim();
  if (!name) return DEFAULT_POINTS;

  const matched = [];
  for (const group of SELLING_POINT_MAP) {
    if (group.keys.some((k) => name.includes(k))) {
      matched.push(...group.points);
    }
  }

  if (!matched.length) return DEFAULT_POINTS;

  // 去重并保留顺序
  return [...new Set(matched)];
}

export function splitSellingPoints(text) {
  return String(text || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinSellingPoints(points) {
  return [...new Set((points || []).map((p) => String(p).trim()).filter(Boolean))].join('、');
}

export function toggleSellingPoint(currentText, point) {
  const list = splitSellingPoints(currentText);
  const idx = list.indexOf(point);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(point);
  return joinSellingPoints(list);
}
