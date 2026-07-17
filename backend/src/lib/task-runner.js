import { prisma } from './prisma.js';
import { fillPrompt, generateText, formatAIError } from './ai.js';
import { toUserErrorMessage } from './user-error.js';
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
  buildImageAttribution,
  withComplianceFooters,
  stripComplianceFooters,
  detectTopicKind,
  WEB_IMAGE_FOOTER_MARKER,
  AI_IMAGE_CREDIT,
  PRODUCT_IMAGE_CREDIT
} from './article-images.js';
import { isNewsArticle } from './news-guard.js';
import { isProductIntroTemplate, buildProductImageJobsFromUploads, PRODUCT_IMAGE_CONCURRENCY } from './product-images.js';
import { isRewriteTemplate, rewriteArticlePipeline } from './rewrite.js';
import {
  isStoryboardTemplate,
  buildStoryboardPrompt,
  STORYBOARD_SYSTEM_PROMPT
} from './storyboard.js';
import {
  resolveAgnesImageUrl,
  localPathFromUploadUrl,
  uploadLocalForAgnes,
  persistImageUrl
} from './public-url.js';
import { logTask } from './logger.js';

export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const runningTasks = new Set();
/** 仅重试配图（跳过文案生成） */
const imageOnlyRetries = new Set();

function stripWebAttribution(output) {
  return stripComplianceFooters(output);
}

function parseTaskImages(record) {
  let imageUrls = [];
  let imageMeta = [];
  try {
    imageUrls = record.imageUrls ? JSON.parse(record.imageUrls) : [];
  } catch {
    imageUrls = record.imageUrl ? [record.imageUrl] : [];
  }
  try {
    imageMeta = record.imageMeta ? JSON.parse(record.imageMeta) : [];
  } catch {
    imageMeta = [];
  }
  if (!Array.isArray(imageUrls)) imageUrls = [];
  if (!Array.isArray(imageMeta)) imageMeta = [];
  return {
    imageUrls: imageUrls.filter(Boolean),
    imageMeta: imageMeta.filter((m) => m?.url)
  };
}

/**
 * 判断重试策略：
 * - images：文案已有，配图不足/失败 → 只重试配图
 * - full：文案也没有 → 整单重提
 * - null：无需重试
 */
export function getRetryPlan(record) {
  if (!record) return null;
  if (record.status === TASK_STATUS.PENDING || record.status === TASK_STATUS.PROCESSING) {
    return null;
  }

  const output = String(record.output || '').trim();
  let imageCount = 0;
  let imageSource = 'ai';
  let productPhotos = null;
  try {
    const input = JSON.parse(record.input || '{}');
    imageCount = Math.min(5, Math.max(0, Number(input.imageCount) || 0));
    imageSource = input.imageSource || 'ai';
    productPhotos = Array.isArray(input.productPhotos) ? input.productPhotos : null;
  } catch {
    /* ignore */
  }

  const { imageUrls } = parseTaskImages(record);
  const needsImages =
    imageCount > 0 || imageSource === 'product' || Boolean(productPhotos?.length);
  const expected =
    imageSource === 'product' || productPhotos?.length
      ? Math.max(imageCount, productPhotos?.length || 0, 1)
      : imageCount;
  const missingImages = needsImages && imageUrls.length < expected;
  const imageFailNote = /配图失败|文案已完成|配图完成|服务繁忙/.test(String(record.error || ''));

  if (output && needsImages && (missingImages || imageFailNote)) {
    return {
      mode: 'images',
      label: '重试配图',
      done: imageUrls.length,
      expected
    };
  }

  if (!output && (record.status === TASK_STATUS.FAILED || imageFailNote)) {
    return { mode: 'full', label: '重新提交' };
  }

  if (record.status === TASK_STATUS.FAILED && !output) {
    return { mode: 'full', label: '重新提交' };
  }

  return null;
}
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS || 12 * 60 * 1000);
/** 产品配图多轮重试，整任务时限放宽，避免有图仍被标失败 */
const PRODUCT_TASK_TIMEOUT_MS = Number(process.env.PRODUCT_TASK_TIMEOUT_MS || 20 * 60 * 1000);

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
  await logTask(taskId, 'info', 'processing started');
}

async function markFailed(taskId, error) {
  const friendly = toUserErrorMessage(error, '生成失败，请稍后重试');
  try {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.FAILED, error: friendly.slice(0, 200) }
    });
    await logTask(taskId, 'error', friendly.slice(0, 500));
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
  const imagesOnly = imageOnlyRetries.has(taskId);
  imageOnlyRetries.delete(taskId);

  const task = await prisma.generationRecord.findUnique({
    where: { id: taskId },
    include: { template: true }
  });
  if (!task?.template) {
    await markFailed(taskId, '模板不存在');
    return;
  }

  const { inputs, imageCount, imageSize, imageSource, productPhotos } = parseInput(task);
  let keyword = inputs.keyword || inputs.theme || Object.values(inputs)[0] || '';
  const style = inputs.style || task.template.name;
  let output = '';
  let rewriteSoftNote = null;

  if (imagesOnly) {
    output = stripWebAttribution(task.output || '');
    if (!output.trim()) {
      await markFailed(taskId, '没有可继续配图的文案，请重新提交');
      return;
    }
    keyword =
      String(inputs.keyword || inputs.theme || '')
        .replace(/\s+/g, ' ')
        .slice(0, 80) || output.slice(0, 40);
    console.log('[task:generation] images-only retry', taskId, {
      imageCount,
      imageSource,
      have: parseTaskImages(task).imageUrls.length
    });
  } else if (isRewriteTemplate(task.template.name)) {
    // 一键改文：先改写文案，再按用户选择走通用配图
    const source = String(inputs.article || inputs.keyword || '').trim();
    console.log('[task:generation] rewrite start', taskId, 'len=', source.length, 'images=', imageCount);
    await logTask(taskId, 'info', 'rewrite start', { length: source.length, imageCount });
    const result = await withTimeout(
      rewriteArticlePipeline({
        source,
        style: inputs.style || '',
        length: inputs.length || '',
        onProgress: (msg) => console.log('[task:rewrite]', taskId, msg)
      }),
      300000,
      '一键改文'
    );
    output = result.output;
    rewriteSoftNote = result.softPass ? '改写已完成，如需差异更大可再提交一次' : null;
    keyword =
      String(result.brief || '')
        .replace(/\s+/g, ' ')
        .slice(0, 80) || source.slice(0, 40);
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { output, error: rewriteSoftNote }
    });
    console.log(
      '[task:generation] rewrite done',
      taskId,
      'sim=',
      result.evaluation.similarity.toFixed(3),
      'pass=',
      result.evaluation.pass
    );

    if (imageCount <= 0) {
      await prisma.generationRecord.update({
        where: { id: taskId },
        data: {
          status: TASK_STATUS.COMPLETED,
          output: withComplianceFooters(output, null, []),
          error: rewriteSoftNote
        }
      });
      await logTask(taskId, 'info', 'completed');
      return;
    }
  } else {
    const prompt = isStoryboardTemplate(task.template.name)
      ? buildStoryboardPrompt(inputs)
      : fillPrompt(task.template.prompt, inputs);
    const newsMode =
      !isStoryboardTemplate(task.template.name) &&
      isNewsArticle({
        templateName: task.template.name,
        style,
        keyword,
        prompt
      });
    if (newsMode) {
      console.log('[task:generation] news mode enabled', taskId, keyword);
    }
    if (isStoryboardTemplate(task.template.name)) {
      console.log(
        '[task:generation] storyboard',
        taskId,
        'platform=',
        inputs.platform || '通用',
        'ratio=',
        inputs.ratio || '9:16'
      );
    }

    console.log('[task:generation] start text', taskId, { imageCount, imageSource });
    await logTask(taskId, 'info', 'text start', { imageCount, imageSource });
    const storyboard = isStoryboardTemplate(task.template.name);
    // 分镜输出长、模型慢：给足时间，并允许超时后自动再试 1 次
    const textTimeout = storyboard ? 480000 : 180000;
    const genOpts = {
      newsMode,
      templateName: task.template.name,
      style,
      keyword: storyboard ? String(inputs.story || '').slice(0, 40) : keyword,
      timeout: textTimeout,
      ...(storyboard
        ? { systemPrompt: STORYBOARD_SYSTEM_PROMPT, temperature: 0.45 }
        : {})
    };

    const runText = () =>
      withTimeout(
        generateText(prompt, genOpts),
        textTimeout + 30000,
        storyboard ? '分镜生成' : '文案生成'
      );

    try {
      output = await runText();
    } catch (err) {
      const msg = String(err?.message || '');
      if (storyboard && /超时|timeout|ETIMEDOUT|aborted/i.test(msg)) {
        console.warn('[task:generation] storyboard timeout, retry once', taskId);
        output = await runText();
      } else {
        throw err;
      }
    }

    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { output, error: null }
    });
    console.log('[task:generation] text done', taskId, 'len=', output.length);
    await logTask(taskId, 'info', 'text done', { length: output.length });
  }

  if (
    isProductIntroTemplate(task.template.name) &&
    (productPhotos?.length || imageSource === 'product')
  ) {
    // ① 解析用户图 → ② 设计提示词+参考图 → ③ 严格逐张串行生成
    console.log('[task:generation] product analyze+design', taskId);
    const resolvedCache = new Map();
    const resolveJobRef = async (storedUrl) => {
      if (!storedUrl) throw new Error('缺少参考图');
      if (resolvedCache.has(storedUrl)) return resolvedCache.get(storedUrl);
      const pub = await resolveAgnesImageUrl(storedUrl);
      resolvedCache.set(storedUrl, pub);
      return pub;
    };

    const { jobs, analysis } = await withTimeout(
      buildProductImageJobsFromUploads({
        photos: productPhotos,
        keyword,
        style,
        sellingPoint: inputs.sellingPoint || '',
        resolvePublicUrl: resolveJobRef
      }),
      180000,
      '产品图解析设计'
    );

    // 把最终张数写回 input，前端进度分母对齐
    try {
      const rawInput = JSON.parse(task.input || '{}');
      await prisma.generationRecord.update({
        where: { id: taskId },
        data: {
          input: JSON.stringify({
            ...rawInput,
            imageCount: jobs.length,
            productAnalysis: analysis
              ? {
                  productSummary: analysis.productSummary,
                  photos: (analysis.photos || []).map((p) => ({
                    index: p.index,
                    angle: p.angle,
                    summary: p.summary,
                    bestFor: p.bestFor
                  }))
                }
              : null
          })
        }
      });
    } catch (err) {
      console.warn('[task:product-image] persist plan meta failed', err.message);
    }

    const imageUrls = [];
    const imageMeta = [];
    let success = 0;
    const failedJobs = [];
    let saveChain = Promise.resolve();

    const runOneJob = async (job) => {
      const stored = job.refUrls?.[0];
      const refUrl = await resolveJobRef(stored);
      console.log(
        '[task:product-image] generate',
        job.type,
        'ref=',
        stored,
        'promptLen=',
        String(job.prompt || '').length
      );
      return generateImageFromRefs({
        prompt: job.prompt,
        images: [refUrl],
        size: 'square',
        retries: 2,
        refreshImages: async () => {
          const local = localPathFromUploadUrl(stored);
          if (!local) return [refUrl];
          const next = await uploadLocalForAgnes(local, 'litterbox');
          resolvedCache.set(stored, next);
          return [next];
        }
      });
    };

    const pushSuccess = async (job, url) => {
      // 并发写库时串行化，避免覆盖
      const op = saveChain.then(async () => {
        if (!url) {
          console.warn('[task:product-image] skip empty url', job.type);
          return false;
        }
        const storedUrl = await persistImageUrl(url);
        if (imageUrls.includes(storedUrl)) {
          console.warn('[task:product-image] skip duplicate/empty url', job.type);
          return false;
        }
        imageUrls.push(storedUrl);
        imageMeta.push({
          url: storedUrl,
          remoteUrl: storedUrl === url ? undefined : url,
          type: job.type,
          slot: job.slot || null,
          caption:
            job.caption ||
            (job.type === 'enhanced'
              ? '画质修复'
              : job.type === 'closeup'
                ? '产品特写'
                : '应用场景'),
          sourceType: 'product',
          credit: PRODUCT_IMAGE_CREDIT,
          photoIndex: job.photoIndex ?? null
        });
        success += 1;
        await saveImages(taskId, imageUrls, imageMeta.filter((m) => m.url));
        return true;
      });
      saveChain = op.catch(() => false);
      return op;
    };

    const concurrency = PRODUCT_IMAGE_CONCURRENCY;
    console.log(
      '[task:generation] product generate',
      taskId,
      'jobs=',
      jobs.length,
      'concurrency=',
      concurrency
    );

    // 有限并行：每路仍是 1 提示词 + 1 参考图；比纯串行快近一倍
    const runIndexedJob = async (job, index) => {
      try {
        if (index > 0 && concurrency === 1) {
          await new Promise((r) => setTimeout(r, 1500));
        } else if (index > 0 && concurrency > 1) {
          // 错峰打，降低瞬间打满队列
          await new Promise((r) => setTimeout(r, 800 * (index % concurrency)));
        }
        const url = await withTimeout(
          runOneJob(job),
          240000,
          `产品图-${index + 1}/${jobs.length}-${job.type}`
        );
        const ok = await pushSuccess(job, url);
        if (!ok) failedJobs.push({ job, error: '重复结果已丢弃' });
      } catch (err) {
        console.warn('[task:product-image]', job.type, err.message);
        failedJobs.push({ job, error: err.message });
        if (/invalid argument|comfyui/i.test(String(err.message || ''))) {
          const stored = job.refUrls?.[0];
          const local = localPathFromUploadUrl(stored);
          if (local) {
            try {
              const next = await uploadLocalForAgnes(local, 'litterbox');
              resolvedCache.set(stored, next);
            } catch (e) {
              console.warn('[task:product-image] host switch failed', e.message);
            }
          }
        }
      }
    };

    {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (cursor < jobs.length) {
          const idx = cursor;
          cursor += 1;
          await runIndexedJob(jobs[idx], idx);
        }
      });
      await Promise.all(workers);
    }

    // 补跑失败项（串行、短间隔）
    if (failedJobs.length && success < jobs.length) {
      console.log('[task:generation] product retry failed jobs', taskId, failedJobs.length);
      await new Promise((r) => setTimeout(r, 5000));
      for (let i = 0; i < failedJobs.length; i += 1) {
        const { job } = failedJobs[i];
        try {
          if (i > 0) await new Promise((r) => setTimeout(r, 2500));
          const url = await withTimeout(runOneJob(job), 240000, `产品图补跑-${job.type}`);
          await pushSuccess(job, url);
        } catch (err) {
          console.warn('[task:product-image:retry]', job.type, err.message);
        }
      }
    }

    const failCount = jobs.length - success;
    await saveImages(taskId, imageUrls, imageMeta.filter((m) => m.url));

    if (success === 0) {
      const soft = `文案已完成，配图失败（${toUserErrorMessage(
        failedJobs[0]?.error || '服务繁忙',
        '服务繁忙'
      )}），可先复制文案`;
      await prisma.generationRecord.update({
        where: { id: taskId },
        data: {
          status: TASK_STATUS.COMPLETED,
          output: withComplianceFooters(output, null, []),
          error: soft.slice(0, 200)
        }
      });
      return;
    }

    const expected = jobs.length;
    const partialNote =
      success < expected
        ? `配图完成 ${success}/${expected} 张${failCount ? `，${failCount} 张因服务繁忙未出` : ''}`
        : null;
    const productMeta = imageMeta.filter((m) => m.url);
    const finalOutput = withComplianceFooters(output, 'product', productMeta);
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.COMPLETED,
        output: finalOutput,
        error: partialNote
      }
    });
    console.log('[task:generation] product completed', taskId, 'images=', success, '/', expected);
    await logTask(taskId, 'info', 'product completed', { success, expected });
    return;
  }

  if (imageCount <= 0) {
    const finalOutput = withComplianceFooters(output, null, []);
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.COMPLETED, output: finalOutput }
    });
    await logTask(taskId, 'info', 'completed');
    return;
  }

  const existing = parseTaskImages(task);
  const imageUrls = [...existing.imageUrls];
  const imageMeta = [...existing.imageMeta];
  const startAt = Math.min(imageUrls.length, imageCount);

  if (startAt >= imageCount) {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.COMPLETED,
        output: withComplianceFooters(output, imageSource, imageMeta),
        error: rewriteSoftNote
      }
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

  for (let i = startAt; i < imageCount; i += 1) {
    const plan = plans[i] || plans[plans.length - 1];
    console.log('[task:generation] image', i + 1, '/', imageCount, imageSource, plan?.searchQuery);
    await logTask(taskId, 'info', `image ${i + 1}/${imageCount} ${imageSource}`, {
      searchQuery: plan?.searchQuery || undefined
    });

    if (imageSource === 'web') {
      const topicKind = detectTopicKind(`${keyword} ${style} ${plan.caption || ''} ${output.slice(0, 200)}`);
      const usedRemote = imageMeta
        .map((m) => m.remoteUrl || m.url)
        .filter((u) => /^https?:\/\//i.test(String(u || '')));
      const results = await withTimeout(
        searchWebImages(plan.searchQuery, 1, {
          keyword,
          caption: plan.caption || '',
          kind: topicKind,
          excludeUrls: usedRemote,
          index: i
        }),
        45000,
        '网络搜图'
      );
      const hit = results[0];
      if (!hit?.url) throw new Error('网络搜图未返回可用图片');
      const storedUrl = await persistImageUrl(hit.url);
      imageUrls.push(storedUrl);
      imageMeta.push({
        url: storedUrl,
        remoteUrl: storedUrl === hit.url ? undefined : hit.url,
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
      const storedUrl = await persistImageUrl(imageUrl);
      imageUrls.push(storedUrl);
      imageMeta.push({
        url: storedUrl,
        remoteUrl: storedUrl === imageUrl ? undefined : imageUrl,
        caption: plan.caption,
        query: plan.searchQuery,
        sourceType: 'ai',
        credit: AI_IMAGE_CREDIT
      });
    }

    await saveImages(taskId, imageUrls, imageMeta);
  }

  let finalOutput = withComplianceFooters(output, imageSource, imageMeta);

  await prisma.generationRecord.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.COMPLETED,
      output: finalOutput,
      error: rewriteSoftNote
    }
  });
  console.log('[task:generation] completed', taskId);
  await logTask(taskId, 'info', 'completed');
}

async function loadTaskImageUrls(taskId) {
  const row = await prisma.generationRecord.findUnique({ where: { id: taskId } });
  if (!row) return [];
  try {
    const urls = JSON.parse(row.imageUrls || '[]');
    return Array.isArray(urls) ? urls.filter(Boolean) : [];
  } catch {
    return row.imageUrl ? [row.imageUrl] : [];
  }
}

async function isProductGenerationTask(taskId) {
  const task = await prisma.generationRecord.findUnique({
    where: { id: taskId },
    include: { template: true }
  });
  if (!task) return false;
  try {
    const input = JSON.parse(task.input || '{}');
    if (input.imageSource === 'product' || input.productPhotos?.length) return true;
  } catch {
    /* ignore */
  }
  return isProductIntroTemplate(task.template?.name);
}

export async function runGenerationTask(taskId) {
  if (runningTasks.has(taskId)) {
    console.log('[task:generation] already running, skip', taskId);
    return;
  }
  runningTasks.add(taskId);
  try {
    const product = await isProductGenerationTask(taskId);
    const budget = product ? PRODUCT_TASK_TIMEOUT_MS : TASK_TIMEOUT_MS;
    await withTimeout(runGenerationTaskBody(taskId), budget, '整任务');
  } catch (err) {
    console.error('[task:generation]', taskId, err.message);
    // 整任务超时但已有配图 → 按部分成功收尾，避免「有图却显示失败」
    if (String(err.message || '').includes('整任务超时')) {
      const urls = await loadTaskImageUrls(taskId);
      if (urls.length) {
        await prisma.generationRecord.update({
          where: { id: taskId },
          data: {
            status: TASK_STATUS.COMPLETED,
            error: `配图完成 ${urls.length} 张（任务超时，其余未出齐，可重新生成）`
          }
        });
        console.log('[task:generation] salvage partial images after timeout', taskId, urls.length);
        await logTask(taskId, 'warn', 'salvage partial images after timeout', { count: urls.length });
        return;
      }
    }
    const isWeb = err.message?.includes('搜图') || err.message?.includes('未找到');
    const msg = isWeb
      ? formatWebImageError(err)
      : err.message?.includes('配图') ||
          err.message?.includes('Agnes') ||
          err.message?.includes('图片') ||
          err.message?.includes('超时')
        ? formatImageError(err)
        : formatAIError(err);

    // 文案已生成、仅配图阶段失败 → 不算整单作废，保留可复制文案
    const existing = await prisma.generationRecord.findUnique({ where: { id: taskId } });
    if (existing?.output?.trim()) {
      const soft = `文案已完成，配图失败（${toUserErrorMessage(msg, '服务繁忙')}），可先复制文案`;
      await prisma.generationRecord.update({
        where: { id: taskId },
        data: {
          status: TASK_STATUS.COMPLETED,
          error: soft.slice(0, 200)
        }
      });
      console.log('[task:generation] salvage text after image failure', taskId);
      await logTask(taskId, 'warn', 'salvage text after image failure');
      return;
    }

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

    const storedUrl = await persistImageUrl(imageUrl);
    const meta = [
      {
        url: storedUrl,
        remoteUrl: storedUrl === imageUrl ? undefined : imageUrl,
        caption: '配图',
        sourceType: 'ai',
        credit: AI_IMAGE_CREDIT
      }
    ];
    await saveImages(taskId, [storedUrl], meta);
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.COMPLETED,
        output: params.imagePrompt || '',
        error: null
      }
    });

    if (task.parentId) {
      await saveImages(task.parentId, [storedUrl], meta);
    }
  } catch (err) {
    console.error('[task:image]', taskId, err.message);
    await markFailed(taskId, formatImageError(err));
  } finally {
    runningTasks.delete(taskId);
  }
}

export function enqueueGenerationTask(taskId) {
  logTask(taskId, 'info', 'queued').catch(() => {});
  setImmediate(() => {
    runGenerationTask(taskId).catch((err) => console.error('[task:generation:unhandled]', err));
  });
}

export function enqueueTextTask(taskId) {
  enqueueGenerationTask(taskId);
}

/**
 * 按策略重试：images 只补配图；full 清空后整单重跑。
 * @returns {{ mode: 'images'|'full', label: string }}
 */
export async function retryGenerationTask(taskId, userId) {
  const task = await prisma.generationRecord.findFirst({
    where: { id: taskId, userId },
    include: { template: true }
  });
  if (!task) {
    const err = new Error('任务不存在');
    err.status = 404;
    throw err;
  }

  const plan = getRetryPlan(task);
  if (!plan) {
    const err = new Error('当前任务无需重试');
    err.status = 400;
    throw err;
  }

  if (runningTasks.has(taskId)) {
    const err = new Error('任务正在处理中，请稍后再试');
    err.status = 400;
    throw err;
  }

  if (plan.mode === 'full') {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.PENDING,
        error: null,
        output: '',
        imageUrl: null,
        imageUrls: null,
        imageMeta: null
      }
    });
    imageOnlyRetries.delete(taskId);
    enqueueGenerationTask(taskId);
    return plan;
  }

  // 仅配图：保留文案与已成功的图
  await prisma.generationRecord.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.PENDING,
      error: null
    }
  });
  imageOnlyRetries.add(taskId);
  enqueueGenerationTask(taskId);
  return plan;
}

export function enqueueImageTask(taskId) {
  setImmediate(() => {
    runImageTask(taskId).catch((err) => console.error('[task:image:unhandled]', err));
  });
}

/** 单张配图重新生成中：taskId -> Set<index> */
const regeneratingSlots = new Map();

export function getRegeneratingIndexes(taskId) {
  const set = regeneratingSlots.get(taskId);
  return set ? [...set].sort((a, b) => a - b) : [];
}

function markSlotRegenerating(taskId, index, on) {
  let set = regeneratingSlots.get(taskId);
  if (!set) {
    set = new Set();
    regeneratingSlots.set(taskId, set);
  }
  if (on) set.add(index);
  else set.delete(index);
  if (!set.size) regeneratingSlots.delete(taskId);
}

/**
 * 重新生成某一张配图（保留文案与其他图）
 */
export async function regenerateOneImage(taskId, userId, imageIndex) {
  const index = Number(imageIndex);
  if (!Number.isInteger(index) || index < 0) {
    const err = new Error('配图序号无效');
    err.status = 400;
    throw err;
  }

  const task = await prisma.generationRecord.findFirst({
    where: { id: taskId, userId },
    include: { template: true }
  });
  if (!task) {
    const err = new Error('任务不存在');
    err.status = 404;
    throw err;
  }

  if (task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.PROCESSING) {
    const err = new Error('任务正在处理中，请稍后再试');
    err.status = 400;
    throw err;
  }

  const output = String(task.output || '').trim();
  if (!output) {
    const err = new Error('请先生成文案后再重新配图');
    err.status = 400;
    throw err;
  }

  const { inputs, imageCount, imageSize, imageSource } = parseInput(task);
  if (imageSource === 'product') {
    const err = new Error('产品配图请使用「重试配图」');
    err.status = 400;
    throw err;
  }

  const existing = parseTaskImages(task);
  if (index >= existing.imageUrls.length && index >= imageCount) {
    const err = new Error('配图序号超出范围');
    err.status = 400;
    throw err;
  }

  if (getRegeneratingIndexes(taskId).includes(index)) {
    const err = new Error('该配图正在重新生成中');
    err.status = 400;
    throw err;
  }

  markSlotRegenerating(taskId, index, true);
  setImmediate(() => {
    runRegenerateOneImage(taskId, index)
      .catch((err) => console.error('[task:regen-image]', taskId, index, err.message))
      .finally(() => markSlotRegenerating(taskId, index, false));
  });

  return { index, message: `第 ${index + 1} 张配图开始重新生成` };
}

async function runRegenerateOneImage(taskId, index) {
  const task = await prisma.generationRecord.findUnique({
    where: { id: taskId },
    include: { template: true }
  });
  if (!task) return;

  const { inputs, imageCount, imageSize, imageSource } = parseInput(task);
  const keyword = inputs.keyword || '';
  const style = inputs.style || '';
  let output = stripWebAttribution(String(task.output || ''));
  const existing = parseTaskImages(task);
  const imageUrls = [...existing.imageUrls];
  const imageMeta = [...existing.imageMeta];

  while (imageUrls.length <= index) imageUrls.push('');
  while (imageMeta.length <= index) imageMeta.push({ url: '', caption: `配图 ${index + 1}` });

  const prev = imageMeta[index] || {};
  const caption = prev.caption || `配图 ${index + 1}`;
  const searchQuery = prev.query || keyword || caption;

  const excludeUrls = [];
  for (let i = 0; i < imageUrls.length; i += 1) {
    const m = imageMeta[i] || {};
    const remote = m.remoteUrl || m.url || imageUrls[i];
    if (/^https?:\/\//i.test(String(remote || ''))) excludeUrls.push(remote);
  }

  console.log('[task:regen-image] start', taskId, index + 1, imageSource, searchQuery);

  let hitUrl;
  let credit = imageSource === 'web' ? '网络公开检索' : AI_IMAGE_CREDIT;
  let photographer = '';
  let sourceUrl = '';

  if (imageSource === 'web') {
    const topicKind = detectTopicKind(`${keyword} ${style} ${caption} ${output.slice(0, 200)}`);
    const results = await withTimeout(
      searchWebImages(searchQuery, 1, {
        keyword,
        caption,
        kind: topicKind,
        excludeUrls,
        index
      }),
      45000,
      '网络搜图'
    );
    const hit = results[0];
    if (!hit?.url) throw new Error('网络搜图未返回可用图片');
    hitUrl = hit.url;
    credit = hit.credit || credit;
    photographer = hit.photographer || '';
    sourceUrl = hit.sourceUrl || '';
  } else {
    const plans = await withTimeout(
      planArticleImages({
        output,
        keyword,
        style,
        count: Math.max(imageCount, index + 1)
      }),
      90000,
      '配图规划'
    );
    const plan = plans[index] || plans[plans.length - 1] || {};
    const scenePrompt = buildImagePromptVariant({
      keyword,
      style,
      templateName: task.template?.name,
      output,
      index,
      total: Math.max(imageCount, index + 1),
      scenePrompt: plan.scenePrompt
    });
    hitUrl = await withTimeout(
      generateImage({ prompt: scenePrompt, size: imageSize }),
      360000,
      'AI 配图'
    );
  }

  const storedUrl = await persistImageUrl(hitUrl);
  imageUrls[index] = storedUrl;
  imageMeta[index] = {
    ...prev,
    url: storedUrl,
    remoteUrl: storedUrl === hitUrl ? undefined : hitUrl,
    caption,
    query: searchQuery,
    sourceType: imageSource === 'web' ? 'web' : 'ai',
    credit,
    photographer,
    sourceUrl
  };

  const cleanMeta = imageMeta.filter((m) => m?.url);
  const cleanUrls = imageUrls.filter(Boolean);
  await saveImages(taskId, cleanUrls, cleanMeta);

  if (imageSource === 'web' || imageSource === 'ai' || imageSource === 'product') {
    const body = stripWebAttribution(String(task.output || ''));
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: {
        output: withComplianceFooters(body, imageSource, cleanMeta),
        error: null,
        status: TASK_STATUS.COMPLETED
      }
    });
  } else {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { error: null, status: TASK_STATUS.COMPLETED }
    });
  }

  console.log('[task:regen-image] done', taskId, index + 1, storedUrl);
}

/**
 * 恢复卡住的任务。
 * @param {{ userId?: string }} [opts] 传入 userId 时仅恢复该用户（API）；启动时可省略以恢复全局。
 * @returns {Promise<number>} 重新入队数量
 */
export async function resumeStuckTasks(opts = {}) {
  const where = {
    status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] }
  };
  if (opts.userId) where.userId = opts.userId;

  const stuck = await prisma.generationRecord.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 20
  });

  if (!stuck.length) {
    console.log('[task:resume] no stuck tasks');
    return 0;
  }

  console.log(
    `[task:resume] found ${stuck.length} stuck task(s)${opts.userId ? ` user=${opts.userId}` : ''}, re-queueing...`
  );
  for (const task of stuck) {
    if (task.taskType === 'image') {
      enqueueImageTask(task.id);
    } else {
      enqueueGenerationTask(task.id);
    }
  }
  return stuck.length;
}
