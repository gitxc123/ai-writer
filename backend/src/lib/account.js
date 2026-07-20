import { prisma } from '../lib/prisma.js';
import { deleteUploadFilesForRecord } from '../lib/upload-cleanup.js';

/**
 * 注销账号：删除生成记录与本地图、订单/分成，匿名化相关投诉联系方式，再删用户。
 */
export async function deleteUserAccount(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true }
  });

  const records = await prisma.generationRecord.findMany({
    where: { userId },
    select: { id: true, imageUrl: true, imageUrls: true, imageMeta: true }
  });

  let files = 0;
  for (const r of records) {
    files += deleteUploadFilesForRecord(r);
  }

  const recordIds = records.map((r) => r.id);
  if (recordIds.length) {
    await prisma.taskLog.deleteMany({ where: { taskId: { in: recordIds } } });
    try {
      await prisma.complaint.updateMany({
        where: { recordId: { in: recordIds } },
        data: {
          contact: '[已注销匿名]',
          note: '账号注销后联系方式已匿名化'
        }
      });
    } catch (err) {
      console.warn('[account] anonymize complaints by record', err.message);
    }
  }

  if (user?.phone) {
    try {
      await prisma.complaint.updateMany({
        where: { contact: { contains: user.phone } },
        data: { contact: '[已注销匿名]' }
      });
    } catch (err) {
      console.warn('[account] anonymize complaints by phone', err.message);
    }
  }

  await prisma.generationRecord.deleteMany({ where: { userId } });
  await prisma.membershipOrder.deleteMany({ where: { userId } });
  await prisma.agentCommission.deleteMany({
    where: { OR: [{ agentId: userId }, { fromUserId: userId }] }
  });
  try {
    await prisma.activationRedeem.deleteMany({ where: { userId } });
    await prisma.activationRedeem.deleteMany({ where: { agentId: userId } });
    await prisma.activationCode.deleteMany({ where: { agentId: userId } });
  } catch (err) {
    console.warn('[account] activation cleanup', err.message);
  }

  await prisma.user.delete({ where: { id: userId } });

  return { records: recordIds.length, files };
}
