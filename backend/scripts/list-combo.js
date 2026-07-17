import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const r = await prisma.generationRecord.findMany({
  where: { taskType: 'combo' },
  orderBy: { createdAt: 'desc' },
  take: 5
});
for (const x of r) {
  let urls = [];
  try { urls = JSON.parse(x.imageUrls || '[]'); } catch {}
  let input = {};
  try { input = JSON.parse(x.input || '{}'); } catch {}
  console.log(JSON.stringify({
    id: x.id,
    status: x.status,
    imageCount: input.imageCount,
    imageSource: input.imageSource,
    urls: urls.length,
    error: x.error,
    updatedAt: x.updatedAt,
    keyword: input.keyword
  }));
}
await prisma.$disconnect();
