const SLOTS = ['front', 'side', 'detail'];

export function normalizeProductPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const photos = list
    .filter((p) => p && p.url && typeof p.url === 'string')
    .slice(0, 3)
    .map((p) => ({
      slot: SLOTS.includes(p.slot) ? p.slot : 'front',
      url: p.url.trim()
    }));
  if (!photos.length) throw new Error('请至少上传 1 张产品图');
  return photos;
}

const CLOSEUP_ANGLES = [
  'three-quarter view product close-up, slight camera angle from upper left',
  'top-down flat lay close-up of the product on clean surface',
  'macro detail close-up focusing on product texture and craftsmanship'
];

function scenePrompts(keyword, style) {
  const audience = style || 'modern consumer';
  const product = keyword || 'the product';
  return [
    `Place ${product} naturally in a realistic lifestyle scene for ${audience}, keep product appearance identical to reference, professional product photography, no text overlay`,
    `Show ${product} being used in a matching application scenario for ${audience}, preserve product shape and materials from reference, natural lighting, no text overlay`
  ];
}

export function planProductImageJobs({ photos, keyword, style }) {
  const normalized = normalizeProductPhotos(photos);
  const jobs = [];

  for (const photo of normalized) {
    jobs.push({
      type: 'enhanced',
      slot: photo.slot,
      refUrls: [photo.url],
      prompt:
        'Enhance image quality: sharper details, balanced lighting, remove noise and blur, preserve exact product shape, colors, logos and proportions, studio-clean background if messy, no text overlay, photorealistic'
    });
  }

  const closeupCount = normalized.length >= 3 ? 3 : 2;
  const primary = normalized[0].url;
  const allRefs = normalized.map((p) => p.url);
  for (let i = 0; i < closeupCount; i += 1) {
    jobs.push({
      type: 'closeup',
      refUrls: allRefs.slice(0, 2),
      prompt: `Using the reference product photo(s), generate a new ${CLOSEUP_ANGLES[i]} of "${keyword || 'the product'}". Preserve brand identity and materials. Photorealistic ecommerce shot, no text overlay.`
    });
  }

  for (const scenePrompt of scenePrompts(keyword, style)) {
    jobs.push({
      type: 'scene',
      refUrls: [primary],
      prompt: scenePrompt
    });
  }

  return jobs;
}

export function isProductIntroTemplate(name) {
  return name === '产品介绍';
}
