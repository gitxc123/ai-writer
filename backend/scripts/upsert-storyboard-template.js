import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE = {
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
};

async function main() {
  let category = await prisma.templateCategory.findFirst({
    where: { name: '视频工具' }
  });
  if (!category) {
    category = await prisma.templateCategory.create({
      data: { name: '视频工具', sort: 5 }
    });
  }

  const existing = await prisma.template.findFirst({ where: { name: TEMPLATE.name } });
  if (existing) {
    const updated = await prisma.template.update({
      where: { id: existing.id },
      data: {
        description: TEMPLATE.description,
        icon: TEMPLATE.icon,
        prompt: TEMPLATE.prompt,
        fields: TEMPLATE.fields,
        categoryId: category.id
      }
    });
    console.log(JSON.stringify({ action: 'updated', id: updated.id }, null, 2));
  } else {
    const created = await prisma.template.create({
      data: {
        ...TEMPLATE,
        categoryId: category.id,
        sort: 0
      }
    });
    console.log(JSON.stringify({ action: 'created', id: created.id }, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
