import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE = {
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
};

async function main() {
  let category = await prisma.templateCategory.findFirst({
    where: { name: '文案工具' }
  });
  if (!category) {
    category = await prisma.templateCategory.create({
      data: { name: '文案工具', sort: 4 }
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
