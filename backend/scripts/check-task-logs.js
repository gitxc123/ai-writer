import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const n = await p.taskLog.count();
const rows = await p.taskLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
console.log('count', n);
console.log(JSON.stringify(rows, null, 2));
await p.$disconnect();
