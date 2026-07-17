import { prisma } from './prisma.js';

const MIGRATIONS = [
  'ALTER TABLE GenerationRecord ADD COLUMN imageUrl TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN status TEXT DEFAULT "pending"',
  'ALTER TABLE GenerationRecord ADD COLUMN taskType TEXT DEFAULT "text"',
  'ALTER TABLE GenerationRecord ADD COLUMN error TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN parentId TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN imageSize TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN imageUrls TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN imageMeta TEXT',
  'ALTER TABLE GenerationRecord ADD COLUMN updatedAt DATETIME',
  'ALTER TABLE User ADD COLUMN memberPlan TEXT DEFAULT "none"',
  'ALTER TABLE User ADD COLUMN memberExpireAt DATETIME',
  'ALTER TABLE User ADD COLUMN isAgent BOOLEAN DEFAULT 0',
  'ALTER TABLE User ADD COLUMN agentRate REAL DEFAULT 0',
  'ALTER TABLE User ADD COLUMN inviteCode TEXT',
  'ALTER TABLE User ADD COLUMN invitedBy TEXT',
  `CREATE TABLE IF NOT EXISTS MembershipOrder (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL,
    planId TEXT NOT NULL,
    planName TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paidAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id)
  )`,
  `CREATE TABLE IF NOT EXISTS AgentCommission (
    id TEXT PRIMARY KEY NOT NULL,
    agentId TEXT NOT NULL,
    fromUserId TEXT NOT NULL,
    orderId TEXT NOT NULL,
    orderAmount REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'settled',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agentId) REFERENCES User(id)
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS User_inviteCode_key ON User(inviteCode)',
  `CREATE TABLE IF NOT EXISTS Complaint (
    id TEXT PRIMARY KEY NOT NULL,
    recordId TEXT NOT NULL,
    contact TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidenceUrl TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolvedAt DATETIME
  )`,
  'CREATE INDEX IF NOT EXISTS Complaint_recordId_idx ON Complaint(recordId)',
  'CREATE INDEX IF NOT EXISTS Complaint_status_idx ON Complaint(status)',
  `CREATE TABLE IF NOT EXISTS TaskLog (
    id TEXT PRIMARY KEY NOT NULL,
    taskId TEXT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    meta TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS TaskLog_createdAt_idx ON TaskLog(createdAt)',
  'CREATE INDEX IF NOT EXISTS TaskLog_taskId_createdAt_idx ON TaskLog(taskId, createdAt)'
];

export async function ensureSchema() {
  for (const sql of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // column / table already exists
    }
  }

  const backfills = [
    'UPDATE GenerationRecord SET status = "pending" WHERE status IS NULL OR status = ""',
    'UPDATE GenerationRecord SET taskType = "text" WHERE taskType IS NULL OR taskType = ""',
    'UPDATE GenerationRecord SET output = "" WHERE output IS NULL',
    'UPDATE GenerationRecord SET updatedAt = createdAt WHERE updatedAt IS NULL',
    'UPDATE User SET memberPlan = "none" WHERE memberPlan IS NULL OR memberPlan = ""',
    'UPDATE User SET isAgent = 0 WHERE isAgent IS NULL',
    'UPDATE User SET agentRate = 0 WHERE agentRate IS NULL'
  ];

  for (const sql of backfills) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn('DB backfill:', err.message);
    }
  }
}
