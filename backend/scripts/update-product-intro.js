import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const prompt = '你是资深营销文案。产品名称：{{keyword}}。核心卖点：{{sellingPoint}}。目标人群：{{style}}。写一段约{{length}}字的产品介绍，把卖点写清楚，并紧扣目标用户痛点。不要编造未提供的参数。'
const fields = JSON.stringify([
  {"key":"keyword","label":"产品名称","placeholder":"例：便携榨汁杯","hint":"只填产品叫什么"},
  {"key":"sellingPoint","label":"产品卖点","placeholder":"例：30秒出汁、可水洗、上班带方便","hint":"写清核心优势，多个卖点用顿号分隔"},
  {"key":"style","label":"目标人群","placeholder":"例：25-35岁通勤上班族","hint":"越具体越好"},
  {"key":"length","label":"字数","placeholder":"建议 150-300"}
])

const result = await prisma.template.updateMany({
  where: { name: '产品介绍' },
  data: { prompt, fields }
})

const rows = await prisma.template.findMany({
  where: { name: '产品介绍' },
  select: { id: true, name: true, fields: true, prompt: true }
})

console.log(JSON.stringify({ updated: result.count, rows }, null, 2))
await prisma.$disconnect()
