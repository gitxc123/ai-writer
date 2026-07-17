import 'dotenv/config';

const base = 'http://localhost:3001';

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800138000', password: '123456' })
});
const login = await loginRes.json();
if (login.code !== 200) {
  console.error('login failed', login);
  process.exit(1);
}
const token = login.data.token;
console.log('login ok');

const resumeRes = await fetch(`${base}/api/records/resume`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }
});
const resumeText = await resumeRes.text();
console.log('resume status', resumeRes.status, resumeText);

const listRes = await fetch(`${base}/api/records`, {
  headers: { Authorization: `Bearer ${token}` }
});
const list = await listRes.json();
const rows = (list.data || []).slice(0, 8).map((r) => ({
  id: r.id.slice(0, 10),
  status: r.status,
  taskType: r.taskType,
  hasOutput: !!(r.output && r.output.length),
  images: (r.imageUrls || []).length,
  error: r.error
}));
console.log(JSON.stringify(rows, null, 2));
