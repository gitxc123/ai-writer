import { prisma } from './prisma.js';
import { fillPrompt, generateText, formatAIError } from './ai.js';
import {
  buildImagePromptVariant,
  generateImage,
  generateImageFromRefs,
  formatImageError
} from './agnes-image.js';
import {
  planArticleImages,
  searchWebImages,
  formatWebImageError,
  buildWebImageAttribution,
  detectTopicKind
} from './article-images.js';
import { isNewsArticle } from './news-guard.js';
import { planProductImageJobs, isProductIntroTemplate } from './product-images.js';
import { resolveAgnesImageUrl } from './public-url.js';

export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const runningTasks = new Set();
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS || 12 * 60 * 1000);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}秒）`)), ms);
    })
  ]);
}

async function markProcessing(taskId) {
  await prisma.generationRecord.update({
    where: { id: taskId },
    data: { status: TASK_STATUS.PROCESSING }
  });
}

async function markFailed(taskId, error) {
  try {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.FAILED, error: error?.slice(0, 500) || '生成失败' }
    });
  } catch (err) {
    console.error('[task:markFailed]', taskId, err.message);
  }
}

function parseInput(task) {
  const raw = JSON.parse(task.input || '{}');
  const productPhotos = Array.isArray(raw.productPhotos) ? raw.productPhotos : null;
  const { imageCount: _ic, imageSize: _is, imageSource: _src, productPhotos: _pp, ...inputs } = raw;
  const imageCount = Math.min(5, Math.max(0, Number(raw.imageCount) || 0));
  const imageSize = raw.imageSize || task.imageSize || 'landscape';
  let imageSource = raw.imageSource === 'web' ? 'web' : 'ai';
  if (raw.imageSource === 'product') imageSource = 'product';
  return { inputs, imageCount, imageSize, imageSource, productPhotos };
}

async function saveImages(taskId, imageUrls, imageMeta) {
  const urlsJson = JSON.stringify(imageUrls);
  const metaJson = JSON.stringify(imageMeta);
  const cover = imageUrls[0] || null;

  try {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        imageUrls: urlsJson,
        imageUrl: cover
      }
    });
  } catch (err) {
    console.warn('[task:saveImages:prisma]', err.message);
  }

  // imageMeta 可能尚未同步到 Prisma Client，用原生 SQL 兜底
  try {
    await prisma.$executeRawUnsafe(
      'UPDATE GenerationRecord SET imageMeta = ?, imageUrls = ?, imageUrl = ? WHERE id = ?',
      metaJson,
      urlsJson,
      cover,
      taskId
    );
  } catch (err) {
    console.warn('[task:saveImages:raw]', err.message);
  }
}

async function runGenerationTaskBody(taskId) {
  await markProcessing(taskId);
  const task = await prisma.generationRecord.findUnique({
    where: { id: taskId },
    include: { template: true }
  });
  if (!task?.template) {
    await markFailed(taskId, '模板不存在');
    return;
  }

  const { inputs, imageCount, imageSize, imageSource, productPhotos } = parseInput(task);
  const keyword = inputs.keyword || inputs.theme || Object.values(inputs)[0] || '';
  const style = inputs.style || task.template.name;
  const prompt = fillPrompt(task.template.prompt, inputs);
  const newsMode = isNewsArticle({
    templateName: task.template.name,
    style,
    keyword,
    prompt
  });
  if (newsMode) {
    console.log('[task:generation] news mode enabled', taskId, keyword);
  }

  console.log('[task:generation] start text', taskId, { imageCount, imageSource });
  const output = await withTimeout(
    generateText(prompt, {
      newsMode,
      templateName: task.template.name,
      style,
      keyword
    }),
    240000,
    '文案生成'
  );

  await prisma.generationRecord.update({
    where: { id: taskId },
    data: { output, error: null }
  });
  console.log('[task:generation] text done', taskId, 'len=', output.length);

  if (
    isProductIntroTemplate(task.template.name) &&
    (productPhotos?.length || imageSource === 'product')
  ) {
    const jobs = planProductImageJobs({
      photos: productPhotos,
      keyword,
      style
    });
    const imageUrls = [];
    const imageMeta = [];
    let success = 0;

    console.log('[task:generation] product pipeline', taskId, 'jobs=', jobs.length);
    for (const job of jobs) {
      try {
        const refs = [];
        for (const u of job.refUrls) {
          refs.push(await resolveAgnesImageUrl(u));
        }
        const url = await withTimeout(
          generateImageFromRefs({ prompt: job.prompt, images: refs, size: 'square' }),
          360000,
          `产品图-${job.type}`
        );
        imageUrls.push(url);
        imageMeta.push({
          url,
          type: job.type,
          slot: job.slot || null,
          caption:
            job.type === 'enhanced' ? '画质修复' : job.type === 'closeup' ? '产品特写' : '应用场景',
          sourceType: 'product-img2img'
        });
        success += 1;
        await saveImages(taskId, imageUrls, imageMeta);
      } catch (err) {
        console.warn('[task:product-image]', job.type, err.message);
        imageMeta.push({
          type: job.type,
          error: err.message,
          sourceType: 'product-img2img'
        });
        await saveImages(taskId, imageUrls, imageMeta);
      }
    }

    if (success === 0) {
      await saveImages(taskId, imageUrls, imageMeta);
      await markFailed(taskId, '产品配图全部失败');
      return;
    }
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.COMPLETED, error: null }
    });
    console.log('[task:generation] product completed', taskId, 'images=', success);
    return;
  }

  if (imageCount <= 0) {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.COMPLETED }
    });
    return;
  }

  const plans = await withTimeout(
    planArticleImages({
      output,
      keyword,
      style,
      count: imageCount
    }),
    90000,
    '配图规划'
  );

  const imageUrls = [];
  const imageMeta = [];

  for (let i = 0; i < imageCount; i += 1) {
    const plan = plans[i] || plans[plans.length - 1];
    console.log('[task:generation] image', i + 1, '/', imageCount, imageSource, plan?.searchQuery);

    if (imageSource === 'web') {
      const topicKind = detectTopicKind(`${keyword} ${style} ${plan.caption || ''} ${output.slice(0, 200)}`);
      const results = await withTimeout(
        searchWebImages(plan.searchQuery, 1, {
          keyword,
          caption: plan.caption || '',
          kind: topicKind
        }),
        45000,
        '网络搜图'
      );
      const hit = results[0];
      if (!hit?.url) throw new Error('网络搜图未返回可用图片');
      imageUrls.push(hit.url);
      imageMeta.push({
        url: hit.url,
        caption: plan.caption,
        query: plan.searchQuery,
        sourceType: 'web',
        credit: hit.credit || '网络公开检索',
        photographer: hit.photographer || '',
        sourceUrl: hit.sourceUrl || ''
      });
    } else {
      const scenePrompt = buildImagePromptVariant({
        keyword,
        style,
        templateName: task.template.name,
        output,
        index: i,
        total: imageCount,
        scenePrompt: plan.scenePrompt
      });
      const imageUrl = await withTimeout(
        generateImage({ prompt: scenePrompt, size: imageSize }),
        360000,
        'AI 配图'
      );
      imageUrls.push(imageUrl);
      imageMeta.push({
        url: imageUrl,
        caption: plan.caption,
        query: plan.searchQuery,
        sourceType: 'ai',
        credit: 'AI 生成配图'
      });
    }

    await saveImages(taskId, imageUrls, imageMeta);
  }

  let finalOutput = output;
  if (imageSource === 'web') {
    finalOutput = output + buildWebImageAttribution(imageMeta);
  }

  await prisma.generationRecord.update({
    where: { id: taskId },
    data: { status: TASK_STATUS.COMPLETED, output: finalOutput, error: null }
  });
  console.log('[task:generation] completed', taskId);
}

export async function runGenerationTask(taskId) {
  if (runningTasks.has(taskId)) {
    console.log('[task:generation] already running, skip', taskId);
    return;
  }
  runningTasks.add(taskId);
  try {
    await withTimeout(runGenerationTaskBody(taskId), TASK_TIMEOUT_MS, '整任务');
  } catch (err) {
    console.error('[task:generation]', taskId, err.message);
    const isWeb = err.message?.includes('搜图') || err.message?.includes('未找到');
    const msg = isWeb
      ? formatWebImageError(err)
      : err.message?.includes('配图') ||
          err.message?.includes('Agnes') ||
          err.message?.includes('图片') ||
          err.message?.includes('超时')
        ? formatImageError(err)
        : formatAIError(err);
    await markFailed(taskId, msg);
  } finally {
    runningTasks.delete(taskId);
  }
}

export async function runImageTask(taskId) {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);
  try {
    await markProcessing(taskId);
    const task = await prisma.generationRecord.findUnique({ where: { id: taskId } });
    if (!task) return;

    const params = JSON.parse(task.input || '{}');
    const imageUrl = await withTimeout(
      generateImage({
        prompt: params.imagePrompt || params.keyword,
        size: params.size || task.imageSize || 'landscape'
      }),
      360000,
      'AI 配图'
    );

    const meta = [{ url: imageUrl, caption: '配图', sourceType: 'ai', credit: 'AI 生成配图' }];
    await saveImages(taskId, [imageUrl], meta);
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.COMPLETED,
        output: params.imagePrompt || '',
        error: null
      }
    });

    if (task.parentId) {
      await saveImages(task.parentId, [imageUrl], meta);
    }
  } catch (err) {
    console.error('[task:image]', taskId, err.message);
    await markFailed(taskId, formatImageError(err));
  } finally {
    runningTasks.delete(taskId);
  }
}

export function enqueueGenerationTask(taskId) {
  setImmediate(() => {
    runGenerationTask(taskId).catch((err) => console.error('[task:generation:unhandled]', err));
  });
}

export function enqueueTextTask(taskId) {
  enqueueGenerationTask(taskId);
}

export function enqueueImageTask(taskId) {
  setImmediate(() => {
    runImageTask(taskId).catch((err) => console.error('[task:image:unhandled]', err));
  });
}

/** 服务启动后恢复因重启而卡住的任务 */
export async function resumeStuckTasks() {
  const stuck = await prisma.generationRecord.findMany({
    where: {
      status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
    },
    orderBy: { createdAt: 'asc' },
    take: 20
  });

  if (!stuck.length) {
    console.log('[task:resume] no stuck tasks');
    return;
  }

  console.log(`[task:resume] found ${stuck.length} stuck task(s), re-queueing...`);
  for (const task of stuck) {
    if (task.taskType === 'image') {
      enqueueImageTask(task.id);
    } else {
      enqueueGenerationTask(task.id);
    }
  }
}
