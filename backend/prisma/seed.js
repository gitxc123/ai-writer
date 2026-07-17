import { PrismaClient } from '@prisma/client';

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
          {
            key: 'keyword',
            label: '笔记主题 / 产品',
            placeholder: '例：平价夏季防晒霜推荐，油皮也友好',
            hint: '写具体一点：人群 + 产品/场景'
          },
          {
            key: 'style',
            label: '表达风格',
            placeholder: '例：真实分享、闺蜜安利',
            hint: '决定语气和排版感'
          },
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
          {
            key: 'keyword',
            label: '文章主题（越具体越好）',
            placeholder: '例：世界杯挪威队不敌英格兰惨遭淘汰',
            hint: '时事写清事件；观点写清讨论角度'
          },
          {
            key: 'style',
            label: '文章类型 / 写作风格',
            placeholder: '例：时事新闻、热点解读、深度分析',
            hint: '选时事新闻会按真实事件写'
          },
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
          {
            key: 'keyword',
            label: '推文主题',
            placeholder: '例：职场新人如何快速上手汇报',
            hint: '用一句话概括要解决的问题'
          },
          {
            key: 'style',
            label: '写作风格',
            placeholder: '例：干货分享、故事共鸣',
            hint: '决定开篇方式和语气'
          },
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
          {
            key: 'keyword',
            label: '视频主题',
            placeholder: '例：上班族居家健身，10分钟减脂',
            hint: '写场景 + 结果'
          },
          {
            key: 'style',
            label: '口播风格',
            placeholder: '例：幽默、干货、情绪共鸣'
          },
          { key: 'length', label: '时长（秒）', placeholder: '常见 30 / 60' }
        ])
      }
    ]
  },
  {
    name: '商业营销',
    sort: 3,
    templates: [
      {
        name: '产品介绍',
        description: '产品卖点文案',
        icon: '🛍️',
        prompt:
          '你是资深营销文案。产品名称：{{keyword}}。核心卖点：{{sellingPoint}}。目标人群：{{style}}。写一段约{{length}}字的产品介绍，把卖点写清楚，并紧扣目标用户痛点。不要编造未提供的参数。',
        fields: JSON.stringify([
          {
            key: 'keyword',
            label: '产品名称',
            placeholder: '例：便携榨汁杯',
            hint: '只填产品叫什么'
          },
          {
            key: 'sellingPoint',
            label: '产品卖点',
            placeholder: '例：30秒出汁、可水洗、上班带方便',
            hint: '写清核心优势，多个卖点用顿号分隔'
          },
          {
            key: 'style',
            label: '目标人群',
            placeholder: '例：25-35岁通勤上班族',
            hint: '越具体越好'
          },
          { key: 'length', label: '字数', placeholder: '建议 150-300' }
        ])
      }
    ]
  },
  {
    name: '文案工具',
    sort: 4,
    templates: [
      {
        name: '一键改文',
        description: '粘贴原文，一键生成可读的改写稿',
        icon: '📝',
        prompt:
          '【一键改文】此模板由专用改写流水线处理。原文：{{article}}。文风：{{style}}。字数约{{length}}。',
        fields: JSON.stringify([
          {
            key: 'article',
            label: '原文',
            placeholder: '在此粘贴完整文章'
          },
          {
            key: 'style',
            label: '改写风格',
            placeholder: '例：更口语、更专业、小红书风'
          },
          {
            key: 'length',
            label: '目标字数',
            placeholder: '建议与原文接近，或填 600 / 1000'
          }
        ])
      }
    ]
  },
  {
    name: '视频工具',
    sort: 5,
    templates: [
      {
        name: '故事分镜提示词',
        description: '粘贴故事段落，输出分镜表 + 指定平台 AI 提示词',
        icon: '🎬',
        prompt:
          '【故事分镜】由专用分镜流水线处理。故事：{{story}}。平台：{{platform}}。风格：{{style}}。比例：{{ratio}}。时长：{{duration}}。运镜：{{cameraMove}}。要求：{{requirements}}。',
        fields: JSON.stringify([
          {
            key: 'story',
            label: '故事原文',
            placeholder: '在此粘贴故事段落或剧本（最多 10000 字）'
          },
          {
            key: 'platform',
            label: '提示词平台',
            placeholder: '选择目标生成工具'
          },
          {
            key: 'style',
            label: '画面风格',
            placeholder: '例：真人实拍、二维动画'
          },
          {
            key: 'ratio',
            label: '画面比例',
            placeholder: '例：9:16'
          },
          {
            key: 'duration',
            label: '单镜时长',
            placeholder: '每个分镜镜头的时长'
          },
          {
            key: 'cameraMove',
            label: '运镜方式',
            placeholder: '例：混合运镜、推镜头'
          },
          {
            key: 'requirements',
            label: '额外要求',
            placeholder: '选填：情绪、禁忌、角色设定等'
          }
        ])
      }
    ]
  }
];

async function main() {
  await prisma.generationRecord.deleteMany();
  await prisma.template.deleteMany();
  await prisma.templateCategory.deleteMany();

  for (const cat of categories) {
    const { templates, ...categoryData } = cat;
    const category = await prisma.templateCategory.create({ data: categoryData });
    for (const [index, tpl] of templates.entries()) {
      await prisma.template.create({
        data: { ...tpl, categoryId: category.id, sort: index }
      });
    }
  }

  console.log('Seed completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
