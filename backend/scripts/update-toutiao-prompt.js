import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOUTIAO_PROMPT =
  '你是今日头条资深编辑。文章主题：{{keyword}}。文章类型/风格：{{style}}。写一篇约{{length}}字的头条文章，段落清晰。硬性要求：标题必须≤30个字（含标点），吸睛但不夸张；正文第一行写标题，其后写正文；不要在正文里写「图1：」这类图片说明。若风格为时事新闻/热点解读，必须基于真实公开信息，可加入观点，禁止胡编事实。';

const updated = await prisma.template.updateMany({
  where: { name: '今日头条创作' },
  data: { prompt: TOUTIAO_PROMPT }
});

console.log('updated templates:', updated.count);
await prisma.$disconnect();
