#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(backendRoot, 'data');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'), { recursive: true });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(dataDir, 'prod.db').replace(/\\/g, '/')}`;
}
if (!process.env.UPLOAD_DIR) {
  process.env.UPLOAD_DIR = path.join(dataDir, 'uploads');
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('npx', ['prisma', 'db', 'push']);
run('node', ['scripts/ensure-seed.js']);
run('node', ['src/index.js']);
