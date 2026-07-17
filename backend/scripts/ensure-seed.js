import { PrismaClient } from '@prisma/client';

/**
 * Production-safe seed: only fill templates when DB is empty.
 * Does NOT wipe users or generation records.
 */
const prisma = new PrismaClient();

const categories = [
  {
    name: '新媒体运营',
    sort: 1,
    templates: [
      {
        name: '小红书创作',
        description: '生成小红书风格种草文案',
        icon: '📕',
        prompt:
          '你是小红书爆款文案专家。根据主题「{{keyword}}」，写一篇小红书笔记，表达风格为「{{style}}」，字数约{{length}}字。包含标题、正文、话题标签。要求口语化、有画面感，贴近真实使用体验。',
        fields: JSON.stringify([
          { key: 'keyword', label: '笔记主题 / 产品', placeholder: '例：平价夏季防晒霜推荐，油皮也友好' },
          { key: 'style', label: '表达风格', placeholder: '例：真实分享、闺蜜安利' },
          { key: 'length', label: '字数', placeholder: '建议 300-600' }
        ])
      },
      {
        name: '今日头条创作',
        description: '根据主题生成头条文章（支持时事新闻/热点解读）',
        icon: '📰',
        prompt:
          '你是今日头条资深编辑。文章主题：{{keyword}}。文章类型/风格：{{style}}。写一篇约{{length}}字的头条文章，段落清晰。硬性要求：标题必须≤30个字（含标点），吸睛但不夸张；正文第一行写标题，其后写正文；不要在正文里写「图1：」这类图片说明。若风格为时事新闻/热点解读，必须基于真实公开信息，可加入观点，禁止胡编事实。',
        fields: JSON.stringify([
          { key: 'keyword', label: '文章主题（越具体越好）', placeholder: '例：世界杯挪威队不敌英格兰惨遭淘汰' },
          { key: 'style', label: '文章类型 / 写作风格', placeholder: '例：时事新闻、热点解读' },
          { key: 'length', label: '目标字数', placeholder: '建议 600-1200' }
        ])
      },
      {
        name: '公众号文案',
        description: '生成微信公众号推文',
        icon: '💬',
        prompt:
          '你是公众号10万+作者。围绕主题「{{keyword}}」写一篇公众号推文，风格为「{{style}}」，约{{length}}字，含标题和小标题。先给读者价值，再给观点。',
        fields: JSON.stringify([
          { key: 'keyword', label: '推文主题', placeholder: '例：职场新人如何快速上手汇报' },
          { key: 'style', label: '写作风格', placeholder: '例：干货分享、故事共鸣' },
          { key: 'length', label: '字数', placeholder: '建议 800-1500' }
        ])
      }
    ]
  },
  {
    name: '短视频创作',
    sort: 2,
    templates: [
      {
        name: '抖音文案',
        description: '短视频口播脚本',
        icon: '🎬',
        prompt:
          '你是抖音百万粉编导。为「{{keyword}}」写一条抖音口播脚本，风格「{{style}}」，时长约{{length}}秒，含开头钩子、正文、结尾引导关注。',
        fields: JSON.stringify([
          { key: 'keyword', label: '视频主题', placeholder: '例：打工人周一生存指南' },
          { key: 'style', label: '风格', placeholder: '例：幽默、干货' },
          { key: 'length', label: '时长（秒）', placeholder: '常见 30 / 60' }
        ])
      }
    ]
  },
  {
    name: '内容工具',
    sort: 3,
    templates: [
      {
        name: '一键改文',
        description: '粘贴原文一键改写',
        icon: '✏️',
        prompt: '【一键改文】此模板由专用改写流水线处理。原文：{{article}}。文风：{{style}}。字数约{{length}}。',
        fields: JSON.stringify([
          { key: 'article', label: '原文', placeholder: '粘贴需要改写的全文' },
          { key: 'style', label: '目标文风', placeholder: '例：更口语、更专业' },
          { key: 'length', label: '目标字数', placeholder: '可选' }
        ])
      }
    ]
  },
  {
    name: '视频工具',
    sort: 4,
    templates: [
      {
        name: '故事分镜提示词',
        description: '剧本拆解为可直接生成的分镜提示词',
        icon: '🎞️',
        prompt: '【故事分镜】由专用分镜流水线处理。',
        fields: JSON.stringify([
          { key: 'story', label: '故事 / 剧本', placeholder: '粘贴完整故事' },
          { key: 'platform', label: '目标平台', placeholder: '通用 / 即梦 / 可灵…' },
          { key: 'style', label: '画面风格', placeholder: '例：电影感、二次元' },
          { key: 'ratio', label: '画幅比例', placeholder: '9:16 / 16:9 / 1:1' },
          { key: 'duration', label: '单镜时长', placeholder: '每个分镜镜头的时长' },
          { key: 'cameraMove', label: '运镜方式', placeholder: '例：混合运镜' },
          { key: 'requirements', label: '额外要求', placeholder: '选填' }
        ])
      }
    ]
  }
];

async function main() {
  const existing = await prisma.template.count();
  if (existing > 0) {
    console.log(`[ensure-seed] skip, templates=${existing}`);
    return;
  }

  for (const cat of categories) {
    const { templates, ...categoryData } = cat;
    const category = await prisma.templateCategory.create({ data: categoryData });
    for (const [index, tpl] of templates.entries()) {
      await prisma.template.create({
        data: { ...tpl, categoryId: category.id, sort: index }
      });
    }
  }
  console.log('[ensure-seed] seeded templates');
}

main()
  .catch((err) => {
    console.error('[ensure-seed]', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
