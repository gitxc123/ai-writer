import { chatWithImages, extractJsonBlock, getMode } from './ai.js';

export const MAX_PRODUCT_PHOTOS = 9;
/** 默认 5 张：1 白底修复 + 2 特写 + 2 场景 */
export const PRODUCT_IMAGE_TARGET = 5;
export const PRODUCT_IMAGE_MIN = 4;
export const PRODUCT_IMAGE_MAX = 5;
/** 并行生成路数（每次仍 1 提示词 + 1 参考图）；1=纯串行 */
export const PRODUCT_IMAGE_CONCURRENCY = Math.min(
  3,
  Math.max(1, Number(process.env.PRODUCT_IMAGE_CONCURRENCY || 2))
);

/** fast=跳过视觉设计与 LLM 审核，直接规则规划（最快） */
export function isProductImageFastMode() {
  const v = String(process.env.PRODUCT_IMAGE_FAST || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function normalizeProductPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const photos = list
    .filter((p) => p && p.url && typeof p.url === 'string')
    .map((p, index) => ({
      slot: p.slot && String(p.slot).trim() ? String(p.slot).trim() : `ref-${index + 1}`,
      url: String(p.url).trim()
    }))
    .filter((p) => p.url)
    .slice(0, MAX_PRODUCT_PHOTOS);
  if (!photos.length) throw new Error('请至少上传 1 张产品图');
  return photos;
}

export const IDENTITY_LOCK = [
  'CRITICAL IDENTITY LOCK:',
  'The output MUST show the EXACT same physical product as in the reference photo.',
  'Keep identical: overall silhouette, proportions, color, materials, surface texture, logo, label text layout, buttons, ports, seams, and every visible detail.',
  'Do NOT invent a different product. Do NOT replace with a similar/generic/stock product of the same category.',
  'Do NOT redesign, restyle, recolor, or change branding.',
  'If uncertain, copy the reference product appearance more strictly.'
].join(' ');

export const BRAND_TEXT_LOCK = [
  'BRAND & TEXT LOCK:',
  'Preserve EVERY logo, trademark, wordmark, icon, engraved/printed letter EXACTLY as in the reference photo.',
  'Do NOT invent, rewrite, translate, blur, remove, stretch, or deform brand text or logos.',
  'Do NOT substitute Apple/Sony/generic logos. Glyph shapes must match the reference tightly.'
].join(' ');

export const QUALITY_LOCK = [
  'QUALITY LOCK:',
  'Ultra-sharp photorealistic ecommerce photo, crisp micro-detail, accurate materials and reflections,',
  'clean low-noise look, natural proportions, no plastic AI skin, no warped edges,',
  'no melted logos, no extra fingers/limbs, no duplicated ghost products.'
].join(' ');

export const SCENE_LOGIC_LOCK = [
  'PHYSICAL LOGIC LOCK:',
  'Object counts must obey real-world physics for one product set.',
  'If earbuds/headphones are worn on ears, any open charging case must be EMPTY or closed — NEVER still holding those same earbuds.',
  'Do not place the same physical units in two places at once.',
  'Accessories in frame must stay consistent with the product being actively used.'
].join(' ');

const CLOSEUP_ANGLE_A =
  'STRICTLY different framing from any front catalog hero: three-quarter side angle, product rotated ~30-45 degrees, fill ~70% of frame';
const CLOSEUP_ANGLE_B =
  'STRICTLY different framing: top-down flat lay OR extreme macro on logo/sensor/stem/button — never the same front-on pose';

export const STUDIO_BG_LOCK = [
  'BACKGROUND LOCK for non-scene product shots:',
  'Use one consistent pure white seamless studio backdrop (#FFFFFF).',
  'No gray paper, no colored backdrop, no gradient wall, no wooden table, no lifestyle room.',
  'Soft even studio lighting, subtle contact shadow only, ecommerce catalog style.'
].join(' ');

export function buildRealUseScenes({ keyword = '', sellingPoint = '', style = '' } = {}) {
  const text = `${keyword} ${sellingPoint}`.toLowerCase();
  const audience = style || 'young adult';

  const rules = [
    {
      test: /(耳机|耳麦|headphone|earbud|earphone|airpods|降噪)/i,
      scenes: [
        `A real person (${audience}) WEARING both earbuds of THIS exact pair ON THEIR EARS while commuting; if a charging case appears it must be closed or clearly EMPTY — NEVER show earbuds still sitting inside the open case while also worn`,
        `A real person (${audience}) WEARING both earbuds of THIS exact pair ON THEIR EARS at a desk; case optional only if empty/closed; do NOT invent a third earbud; product count must be physically possible`
      ]
    },
    {
      test: /(榨汁|果汁|破壁|搅拌机|juicer|blender)/i,
      scenes: [
        `A real kitchen counter scene: this exact juicer is actively blending/juicing fruit, cup attached, slight motion of liquid; person hands optional`,
        `A real breakfast moment: this exact juicer standing beside a filled glass of fresh juice on a kitchen table, ready to drink`
      ]
    },
    {
      test: /(洗发|护发|护肤|面霜|精华|防晒|shampoo|skincare|cream)/i,
      scenes: [
        `A real bathroom/vanity scene: a person (${audience}) using THIS exact bottle/jar in hands while grooming`,
        `A real sink-side scene: THIS exact product open and in use next to a mirror, wet-hands grooming moment`
      ]
    },
    {
      test: /(保温|水杯|水壶|tumbler|thermos|bottle)/i,
      scenes: [
        `A real outdoor/commute scene: a person (${audience}) holding THIS exact bottle and drinking from it`,
        `A real desk/office scene: THIS exact bottle opened beside a laptop during work, condensation or cup marks ok`
      ]
    },
    {
      test: /(筋膜|按摩枪|按摩仪|massage gun|fascia)/i,
      scenes: [
        `A real recovery scene: a person (${audience}) pressing THIS exact massage gun against their shoulder or leg muscle`,
        `A real post-workout scene: THIS exact massage gun in use on the thigh after exercise, gym bag nearby`
      ]
    },
    {
      test: /(空气炸锅|炸锅|烤箱|air fryer|oven)/i,
      scenes: [
        `A real kitchen scene: THIS exact air fryer open with cooked food inside on a counter`,
        `A real dinner prep scene: a person (${audience}) removing a basket/tray from THIS exact air fryer`
      ]
    },
    {
      test: /(鼠标|键盘|键鼠|mouse|keyboard)/i,
      scenes: [
        `A real desk scene: a person (${audience}) using THIS exact mouse/keyboard while working on a computer`,
        `A real late-night work scene: THIS exact peripheral under hand on a desk with monitor glow`
      ]
    },
    {
      test: /(吸尘|扫地|清洁|vacuum|cleaner)/i,
      scenes: [
        `A real home scene: a person (${audience}) actively vacuuming a living-room floor with THIS exact device`,
        `A real cleaning scene: THIS exact vacuum in use along sofa edges or carpet`
      ]
    },
    {
      test: /(台灯|护眼灯|desk lamp|lamp)/i,
      scenes: [
        `A real study scene: THIS exact lamp turned on over homework/books, person studying`,
        `A real night desk scene: THIS exact lamp illuminating a laptop keyboard for ${audience}`
      ]
    }
  ];

  for (const rule of rules) {
    if (rule.test.test(text)) return rule.scenes;
  }

  return [
    `A realistic in-use moment: a person (${audience}) actively using THIS exact product with their hands, not a static shelf display`,
    `A different realistic context: THIS exact product mid-use in daily life for ${audience}, clearly interacting with the product`
  ];
}

function pickRefIndex(type, sceneIndex, total) {
  if (total <= 1) return 0;
  if (type === 'enhanced') return 0;
  if (type === 'closeup') return Math.min(1 + (sceneIndex || 0), total - 1);
  const offset = 2 + (sceneIndex || 0);
  return Math.min(offset, total - 1);
}

function captionForType(type) {
  if (type === 'enhanced') return '画质修复';
  if (type === 'closeup') return '产品特写';
  return '应用场景';
}

function pickCloseupAngle(i) {
  return i === 0 ? CLOSEUP_ANGLE_A : CLOSEUP_ANGLE_B;
}

export function ensurePromptLocks(prompt, type) {
  let p = String(prompt || '').trim();
  if (!/IDENTITY LOCK/i.test(p)) p = `${IDENTITY_LOCK} ${p}`;
  if (!/BRAND & TEXT LOCK/i.test(p)) p = `${BRAND_TEXT_LOCK} ${p}`;
  if (!/QUALITY LOCK/i.test(p)) p = `${QUALITY_LOCK} ${p}`;
  if (type === 'scene') {
    if (!/PHYSICAL LOGIC LOCK/i.test(p)) p = `${SCENE_LOGIC_LOCK} ${p}`;
  } else if (!/BACKGROUND LOCK|pure white seamless/i.test(p)) {
    p = `${STUDIO_BG_LOCK} ${p}`;
  }
  return p;
}

export function applyCategoryLogicPatch(prompt, { type, keyword = '', sellingPoint = '' } = {}) {
  let p = String(prompt || '');
  const text = `${keyword} ${sellingPoint} ${p}`;
  if (type === 'scene' && /(耳机|耳麦|earbud|earphone|airpods|headphone|降噪)/i.test(text)) {
    if (!/EMPTY|empty case|not.*inside the case|NEVER.*(case|earbuds both)/i.test(p)) {
      p +=
        ' EARBUD LOGIC: if worn on ears, charging case must be empty or closed; NEVER show the same earbuds both in ears and still nested in an open case; do not invent extra earbuds.';
    }
  }
  return p;
}

export function reinforceJobPrompt(job, ctx = {}) {
  const type = job?.type || 'scene';
  let prompt = ensurePromptLocks(job?.prompt, type);
  prompt = applyCategoryLogicPatch(prompt, {
    type,
    keyword: ctx.keyword,
    sellingPoint: ctx.sellingPoint
  });
  return { ...job, prompt };
}

export function detectPromptLogicIssues(job, ctx = {}) {
  const issues = [];
  const p = String(job?.prompt || '');
  const text = `${ctx.keyword || ''} ${ctx.sellingPoint || ''} ${p}`;
  if (job?.type === 'scene' && /(耳机|earbud|airpods|headphone|降噪)/i.test(text)) {
    const mentionsCase = /case|充电盒|耳机盒/i.test(p);
    const mentionsWorn = /wear|wearing|ON THEIR EARS|戴/i.test(p);
    const forbidsFilled = /EMPTY|empty|NEVER.*inside|not.*inside the case|EARBUD LOGIC/i.test(p);
    if (mentionsWorn && mentionsCase && !forbidsFilled) {
      issues.push('earbuds_worn_with_filled_case_risk');
    }
  }
  if (!/BRAND & TEXT LOCK|logo|trademark|wordmark/i.test(p)) {
    issues.push('missing_brand_lock');
  }
  if (!/QUALITY LOCK|ultra-sharp|photoreal/i.test(p)) {
    issues.push('missing_quality_lock');
  }
  if (job?.type !== 'scene' && !/white seamless|BACKGROUND LOCK|#FFFFFF/i.test(p)) {
    issues.push('missing_white_bg');
  }
  return issues;
}

export async function auditAndFixProductJobs(jobs, ctx = {}) {
  const reinforced = (Array.isArray(jobs) ? jobs : []).map((j) => reinforceJobPrompt(j, ctx));
  if (!reinforced.length) return reinforced;
  if (getMode() === 'mock' || isProductImageFastMode()) return reinforced;

  const flagged = reinforced.map((j, index) => ({
    index,
    type: j.type,
    issues: detectPromptLogicIssues(j, ctx),
    prompt: j.prompt
  }));

  const needsLlm = flagged.some((x) => x.issues.length || x.type === 'scene');
  if (!needsLlm) return reinforced;

  try {
    const system = [
      'You are a strict product-image prompt QA reviewer.',
      'Fix prompts that hurt identity, brand text, photo quality, or physical logic.',
      'Reply with ONLY valid JSON.'
    ].join(' ');
    const text = [
      `Product: ${ctx.keyword || ''}`,
      `Selling points: ${ctx.sellingPoint || ''}`,
      `Audience: ${ctx.style || ''}`,
      'Review these generation jobs. For each problem job, return a corrected detailed ENGLISH prompt that:',
      '1) preserves exact product identity + logos/text from reference (no rewritten trademarks),',
      '2) asks for ultra-sharp photoreal ecommerce quality,',
      '3) for scene shots: forbids impossible object counts (e.g. earbuds worn AND still inside open case),',
      '4) keeps studio white bg for enhanced/closeup only.',
      'Input jobs:',
      JSON.stringify(
        flagged.map((f) => ({
          index: f.index,
          type: f.type,
          issues: f.issues,
          prompt: f.prompt
        })),
        null,
        2
      ),
      'Return: { "fixes": [ { "index": 0, "prompt": "full corrected prompt...", "reason": "short" } ] }',
      'Only include jobs you change.'
    ].join('\n');

    const raw = await chatWithImages({ system, text, imageUrls: [], temperature: 0.1 });
    const parsed = extractJsonBlock(raw);
    const fixes = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
    const next = [...reinforced];
    for (const fix of fixes) {
      const idx = Number(fix?.index);
      if (!Number.isFinite(idx) || idx < 0 || idx >= next.length) continue;
      const prompt = String(fix?.prompt || '').trim();
      if (prompt.length < 40) continue;
      next[idx] = reinforceJobPrompt({ ...next[idx], prompt }, ctx);
      console.log(
        '[product-images] prompt audited',
        next[idx].type,
        fix.reason || '',
        'issues=',
        flagged.find((f) => f.index === idx)?.issues?.join(',') || ''
      );
    }
    return next;
  } catch (err) {
    console.warn('[product-images] audit skipped', err.message);
    return reinforced;
  }
}

export function planProductImageJobs({ photos, keyword, style, sellingPoint }) {
  const normalized = normalizeProductPhotos(photos);
  const jobs = [];
  const nameHint = keyword ? `Product name hint (do not override visual identity): ${keyword}.` : '';
  const sellHint = sellingPoint
    ? `Selling-point hint (do not invent a new product): ${sellingPoint}.`
    : '';
  const ctx = { keyword, sellingPoint, style };

  const pick = (type, sceneIndex = 0) => {
    const idx = pickRefIndex(type, sceneIndex, normalized.length);
    const photo = normalized[idx];
    return { slot: photo.slot, refUrls: [photo.url], photoIndex: idx };
  };

  const enhanceRef = pick('enhanced');
  jobs.push(
    reinforceJobPrompt(
      {
        type: 'enhanced',
        slot: enhanceRef.slot,
        refUrls: enhanceRef.refUrls,
        photoIndex: enhanceRef.photoIndex,
        caption: captionForType('enhanced'),
        prompt: [
          'Task: ONE ultra-sharp catalog hero — quality enhancement of THIS reference photo.',
          'Sharpen details, reduce noise/blur, balance exposure.',
          'If background is messy/colored, replace with pure white seamless studio backdrop.',
          'Keep the product identical including logos/text; do not crop away important parts.',
          'Photorealistic, no overlay text, no watermark.',
          nameHint,
          sellHint
        ]
          .filter(Boolean)
          .join(' ')
      },
      ctx
    )
  );

  for (let i = 0; i < 2; i += 1) {
    const closeupRef = pick('closeup', i);
    jobs.push(
      reinforceJobPrompt(
        {
          type: 'closeup',
          slot: closeupRef.slot,
          refUrls: closeupRef.refUrls,
          photoIndex: closeupRef.photoIndex,
          caption: captionForType('closeup'),
          prompt: [
            `Task: STUDIO variety shot #${i + 1} — ${pickCloseupAngle(i)}.`,
            'Base on THIS reference photo; do not invent a different product.',
            'Composition MUST differ from the front catalog hero.',
            'Preserve logos/text exactly. Pure white seamless only. Photorealistic ecommerce look.',
            nameHint
          ]
            .filter(Boolean)
            .join(' ')
        },
        ctx
      )
    );
  }

  const scenes = buildRealUseScenes({ keyword, sellingPoint, style });
  scenes.forEach((useScene, sceneIndex) => {
    const sceneRef = pick('scene', sceneIndex);
    jobs.push(
      reinforceJobPrompt(
        {
          type: 'scene',
          slot: sceneRef.slot,
          refUrls: sceneRef.refUrls,
          photoIndex: sceneRef.photoIndex,
          caption: captionForType('scene'),
          prompt: [
            `Task: realistic APPLICATION / IN-USE photo #${sceneIndex + 1}.`,
            useScene,
            'Use THIS reference photo for product identity and brand marks.',
            'Photorealistic natural lighting; no overlay text; no watermark; no impossible product duplication.',
            nameHint
          ]
            .filter(Boolean)
            .join(' ')
        },
        ctx
      )
    );
  });

  return jobs.slice(0, PRODUCT_IMAGE_TARGET);
}

export function normalizeDesignedJobs(rawJobs, photosResolved, ctx = {}) {
  const photos = normalizeProductPhotos(photosResolved);
  const list = Array.isArray(rawJobs) ? rawJobs : [];
  const jobs = [];

  for (const item of list) {
    const type = String(item?.type || '').toLowerCase();
    if (!['enhanced', 'closeup', 'scene'].includes(type)) continue;
    let idx = Number(item?.photoIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= photos.length) idx = 0;
    const photo = photos[idx];
    const reinforced = reinforceJobPrompt(
      {
        type,
        slot: photo.slot,
        refUrls: [photo.url],
        caption: String(item?.captionZh || captionForType(type)).slice(0, 40),
        prompt: item?.prompt,
        photoIndex: idx
      },
      ctx
    );
    if (String(reinforced.prompt || '').length < 40) continue;
    jobs.push(reinforced);
  }

  const seen = new Set();
  const deduped = jobs.filter((j) => {
    const key = `${j.type}:${j.photoIndex}`;
    if (seen.has(key) && j.type === 'enhanced') return false;
    if (seen.has(`${j.type}:${j.prompt.slice(0, 80)}`)) return false;
    seen.add(key);
    seen.add(`${j.type}:${j.prompt.slice(0, 80)}`);
    return true;
  });

  if (deduped.length >= PRODUCT_IMAGE_MIN) {
    return deduped.slice(0, PRODUCT_IMAGE_MAX);
  }

  console.warn('[product-images] design too thin, fallback to rule plan');
  return planProductImageJobs({
    photos,
    keyword: ctx.keyword,
    style: ctx.style,
    sellingPoint: ctx.sellingPoint
  });
}

export async function analyzeAndDesignProductJobs(
  photosResolved,
  { keyword, sellingPoint, style, targetCount = PRODUCT_IMAGE_TARGET } = {}
) {
  const count = Math.min(
    PRODUCT_IMAGE_MAX,
    Math.max(PRODUCT_IMAGE_MIN, Number(targetCount) || PRODUCT_IMAGE_TARGET)
  );

  if (getMode() === 'mock' || isProductImageFastMode()) {
    const jobs = planProductImageJobs({
      photos: photosResolved,
      keyword,
      style,
      sellingPoint
    });
    return {
      analysis: {
        productSummary: keyword || 'product',
        photos: photosResolved.map((p, index) => ({
          index,
          slot: p.slot,
          angle: index === 0 ? 'front' : index === 1 ? 'side' : 'detail',
          summary: '',
          bestFor: []
        }))
      },
      jobs
    };
  }

  const system = [
    'You are a product photography analyst and ecommerce art director.',
    'Understand each numbered reference photo, then design img2img jobs.',
    'Each job uses EXACTLY one reference photoIndex.',
    'Prompts MUST preserve logos/trademarks exactly and obey physical object-count logic.',
    'Reply with ONLY valid JSON (no markdown).'
  ].join(' ');

  const text = [
    `Product name: ${keyword || '(unknown)'}`,
    `Selling points: ${sellingPoint || '(none)'}`,
    `Audience: ${style || '(general)'}`,
    `There are ${photosResolved.length} photos: photo[0] … photo[${photosResolved.length - 1}].`,
    `Design exactly ${count} generation jobs.`,
    'Must include: 1 enhanced (white catalog hero), 2 closeups (white, different angles), 2 scenes (real in-use, not white bg).',
    'Prompt rules:',
    '- detailed ENGLISH; stress identity lock + brand/text lock + ultra-sharp quality',
    '- NEVER allow rewriting trademarks/logos',
    '- for earbuds/headphones scenes: if worn on ears, case must be empty/closed; never earbuds both in ears and inside case',
    '- photoIndex must be valid; avoid near-duplicate jobs',
    'Return JSON:',
    '{',
    '  "productSummary": "one sentence product look including brand marks visible",',
    '  "photos": [{ "index": 0, "angle": "front|side|back|top|detail|in_use|other", "summary": "...", "bestFor": ["enhanced"] }],',
    '  "jobs": [{ "type": "enhanced|closeup|scene", "photoIndex": 0, "captionZh": "短标签", "prompt": "..." }]',
    '}'
  ].join('\n');

  const raw = await chatWithImages({
    system,
    text,
    imageUrls: photosResolved.map((p) => p.publicUrl),
    temperature: 0.2
  });
  const parsed = extractJsonBlock(raw);
  const analysis = {
    productSummary: String(parsed?.productSummary || keyword || '').trim(),
    photos: photosResolved.map((p, index) => {
      const hit =
        (Array.isArray(parsed?.photos) ? parsed.photos : []).find((x) => Number(x?.index) === index) ||
        {};
      return {
        index,
        slot: p.slot,
        url: p.url,
        publicUrl: p.publicUrl,
        angle: String(hit.angle || 'other'),
        summary: String(hit.summary || ''),
        colors: String(hit.colors || ''),
        details: String(hit.details || ''),
        bestFor: Array.isArray(hit.bestFor) ? hit.bestFor.map(String) : []
      };
    })
  };
  const jobs = normalizeDesignedJobs(parsed?.jobs, photosResolved, {
    keyword,
    sellingPoint,
    style,
    targetCount: count
  });
  return { analysis, jobs };
}

export async function buildProductImageJobsFromUploads({
  photos,
  keyword,
  style,
  sellingPoint,
  resolvePublicUrl
}) {
  const normalized = normalizeProductPhotos(photos);
  if (typeof resolvePublicUrl !== 'function') {
    throw new Error('缺少 resolvePublicUrl');
  }

  const photosResolved = await Promise.all(
    normalized.map(async (p) => ({
      ...p,
      publicUrl: await resolvePublicUrl(p.url)
    }))
  );

  const ctx = { keyword, sellingPoint, style };

  if (isProductImageFastMode()) {
    console.log('[product-images] FAST mode: skip vision, rule plan + reinforce');
    return {
      analysis: null,
      jobs: await auditAndFixProductJobs(
        planProductImageJobs({ photos: normalized, keyword, style, sellingPoint }),
        ctx
      ),
      photosResolved
    };
  }

  try {
    const { analysis, jobs } = await analyzeAndDesignProductJobs(photosResolved, {
      keyword,
      sellingPoint,
      style,
      targetCount: PRODUCT_IMAGE_TARGET
    });
    const audited = await auditAndFixProductJobs(jobs, ctx);
    console.log(
      '[product-images] designed+audited jobs=',
      audited.length,
      audited.map((j) => j.type).join(','),
      'summary=',
      String(analysis?.productSummary || '').slice(0, 60)
    );
    return { analysis, jobs: audited, photosResolved };
  } catch (err) {
    console.warn('[product-images] analyze+design failed, use rule plan', err.message);
    return {
      analysis: null,
      jobs: await auditAndFixProductJobs(
        planProductImageJobs({ photos: normalized, keyword, style, sellingPoint }),
        ctx
      ),
      photosResolved
    };
  }
}

export function isProductIntroTemplate(name) {
  return name === '产品介绍';
}

/** 临时对用户隐藏的模板（数据仍保留，后续重订方案后再开放） */
export function isHiddenTemplate(name) {
  return isProductIntroTemplate(name);
}
