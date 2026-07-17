import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const rows = await prisma.generationRecord.findMany({
  orderBy: { createdAt: 'desc' },
  take: 10,
  select: {
    id: true,
    status: true,
    taskType: true,
    error: true,
    output: true,
    imageUrls: true,
    input: true,
    createdAt: true,
    updatedAt: true
  }
});

for (const r of rows) {
  console.log('---');
  console.log(JSON.stringify({
    id: r.id,
    status: r.status,
    taskType: r.taskType,
    error: r.error,
    hasOutput: !!(r.output && r.output.length),
    outputLen: (r.output || '').length,
    imageUrls: r.imageUrls,
    input: r.input?.slice(0, 200),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }, null, 2));
}

await prisma.$disconnect();
