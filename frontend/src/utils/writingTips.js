/** 首页写作建议：提倡坚持发布与高质量创作 */

export const WRITING_TIPS = [
  {
    title: '先求稳，再求多',
    body: '连续发布比偶尔爆更重要。定一个你能坚持的节奏（如每周 3 篇），比天天硬撑更可持续。'
  },
  {
    title: '少而精，比堆字数更有用',
    body: '一篇有观点、有结构、有配图说明的短文，往往比三篇注水稿更容易获得收藏与转发。'
  },
  {
    title: '发出去之前，先当读者读一遍',
    body: '用 AI 起草后，花三分钟删空话、补事实、改标题。高质量路线的关键，往往在这一步。'
  },
  {
    title: '同一选题，做系列比单篇更有记忆点',
    body: '选定一个垂直方向，用系列更新把读者留下来。工具帮你出稿，定位要靠你自己稳住。'
  },
  {
    title: '保留 AI 标识，反而更专业',
    body: '按规定标注 AI 生成内容，既合规也建立信任。别为了「看起来像全手写」删掉必要说明。'
  },
  {
    title: '配图服务主题，不为凑图',
    body: '图要对题、要能读懂。宁可少一张，也不要放无关图。网络图务必自行确认授权后再发。'
  }
];

export function pickWritingTip(seed = Date.now()) {
  const i = Math.abs(Number(seed) || 0) % WRITING_TIPS.length;
  return { ...WRITING_TIPS[i], index: i };
}
