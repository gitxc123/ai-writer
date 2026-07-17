import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const stuck = await prisma.generationRecord.findMany({
  where: { status: { in: ['pending', 'processing'] } },
  orderBy: { createdAt: 'desc' },
  take: 20
});
console.log('stuck count:', stuck.length);
for (const r of stuck) {
  console.log(JSON.stringify({
    id: r.id,
    status: r.status,
    taskType: r.taskType,
    userId: r.userId,
    createdAt: r.createdAt,
    input: (r.input || '').slice(0, 120),
    outputLen: (r.output || '').length,
    error: r.error
  }));
}
const recent = await prisma.generationRecord.findMany({
  orderBy: { createdAt: 'desc' },
  take: 10
});
console.log('--- recent ---');
for (const r of recent) {
  console.log(r.id.slice(0, 12), r.status, r.taskType, 'out=' + (r.output || '').length, r.error || '');
}
await prisma.$disconnect();
