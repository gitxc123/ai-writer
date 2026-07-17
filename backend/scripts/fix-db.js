import 'dotenv/config';
import { ensureSchema } from '../src/lib/ensure-schema.js';
import { prisma } from '../src/lib/prisma.js';

await ensureSchema();
console.log('Database schema ensured.');
process.exit(0);
