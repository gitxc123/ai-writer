export const STORYBOARD_TEMPLATE_NAME = '故事分镜提示词';
export const MIN_STORY_CHARS = 30;
export const MAX_STORY_CHARS = 10000;

export function isStoryboardTemplate(name) {
  return name === STORYBOARD_TEMPLATE_NAME;
}

export const STORYBOARD_SYSTEM_PROMPT =
  '你是影视分镜与 AI 视频提示词专家。核心交付物是：每个分镜一条「独立完整、可直接粘贴生成」的提示词。提示词必须自洽，不依赖其他镜头上下文。只输出要求结构，不要寒暄。';

/** 平台写作要点 */
const PLATFORM_HINTS = {
  即梦: `即梦：中文完整句；必须含主体外貌锁定、场景、动作、光线、运镜、时长、画幅；适合文生视频/图。`,
  可灵: `可灵：中文完整句；强调连续动作、运镜路径、时长感；主体外貌每镜重复锁定。`,
  Midjourney: `Midjourney：英文完整句；subject identity + scene + action + lighting + camera；可加 --ar；每镜独立。`,
  Flux: `Flux：英文完整自然句；身份/场景/动作/光影齐全；不要 Midjourney 参数。`,
  Runway: `Runway：英文；写清 subject、action continuity、camera move、duration feel。`,
  海螺视频: `海螺：中文完整句；主体、动作、环境、运镜、氛围、时长齐全。`,
  豆包: `豆包：中文完整句；主体外貌、动作、场景、光线、运镜、时长感写全，保证单镜可独立出片。`,
  通用: `通用：中英各一版完整提示；无平台专属参数；每镜自洽。`
};

export function platformHint(platform) {
  const key = String(platform || '').trim();
  return PLATFORM_HINTS[key] || PLATFORM_HINTS['通用'];
}

/** 按故事长度限制镜头数，避免输出过长导致超时 */
export function suggestMaxShots(storyLen) {
  const n = Number(storyLen) || 0;
  if (n < 200) return 6;
  if (n < 500) return 8;
  if (n < 1200) return 10;
  if (n < 3000) return 12;
  return 14;
}

/**
 * 产出「每镜独立完整提示词」为主；总览仅作索引。
 * duration = 单镜时长；整片时长由文案分析得出。
 */
export function buildStoryboardPrompt(inputs = {}) {
  const story = String(inputs.story || inputs.article || '').trim();
  const platform = String(inputs.platform || '通用').trim() || '通用';
  const style = String(inputs.style || '真人实拍').trim() || '真人实拍';
  const ratio = String(inputs.ratio || '9:16').trim() || '9:16';
  const shotDuration = String(inputs.duration || '5秒').trim() || '5秒';
  const cameraMove = String(inputs.cameraMove || '按剧情自动').trim() || '按剧情自动';
  const requirements = String(inputs.requirements || '').trim() || '无额外限制';
  const maxShots = suggestMaxShots(story.length);
  const preferZh = !/Midjourney|Flux|Runway/i.test(platform);

  const cameraMoveRule =
    cameraMove === '混合运镜' || cameraMove === '按剧情自动'
      ? `运镜按剧情选择，但全片气质统一。`
      : `运镜以「${cameraMove}」为主，少数镜可微调。`;

  const reqNote = /无字幕|无声音|无旁白|无口播|无文字/.test(requirements)
    ? `每条提示词都必须体现限制：${requirements}。`
    : '';

  return `把故事拆成多个分镜。用户真正需要的是：每个分镜一条「独立完整」的「${platform}」提示词，复制后就能单独生成贴近主题的片段。

【故事】
${story}

【参数】风格=${style}；画幅=${ratio}；单镜时长=${shotDuration}（不是整片总时长）；运镜=${cameraMove}（${cameraMoveRule}）；平台=${platform}（${platformHint(platform)}）；额外要求=${requirements}
${reqNote}

【拆镜规则】
1. 先提炼主题与角色身份锁定（年龄/性别/发型/服装/气质），全片所有提示词必须重复同一套身份描述。
2. 镜头数 ≤ ${maxShots}；整片总时长 ≈ 镜头数 × ${shotDuration}。
3. 每条提示词必须自包含：即使单独拿去生成，也能看懂人物、场景、动作、情绪，不依赖「上一镜」。
4. 禁止空洞形容词堆砌；禁止版权角色名；贴近故事主题，不要跑偏。

请严格按以下结构输出：

## 一、镜头索引（简短）
用列表即可（不要大表格）：
- 主题：
- 角色锁定：（固定外貌描述，后续每镜复用）
- 镜头数 / 整片预估时长：
- 镜头N：一句话剧情要点

## 二、分镜独立提示词（重点，必须完整）
每个镜头按下面格式输出，可直接复制到「${platform}」：

### 镜头 N｜剧情要点（十数字内）
- 对应原文：（摘一句故事）
- 完整提示词：
${
  preferZh
    ? `（中文，一段完整可粘贴文本，建议 80–160 字。必须同时包含：角色锁定外貌、场景环境、正在发生的动作、表情情绪、光线氛围、景别运镜、时长约 ${shotDuration}、画幅 ${ratio}、风格 ${style}。写得具体到能单独生成该片段。）`
    : `（英文一段完整 prompt，建议 40–90 words。Must include: locked character look, environment, action, emotion, lighting, camera move, about ${shotDuration}, ${ratio}, ${style}. Self-contained for standalone generation.）`
}
- 负面提示：（可选一行，如：无字幕、无水印、无变形手指；若用户要求无字幕/无声音等必须写入）
- 参数建议：（一行，如模型/画幅/--ar；没有就写「默认」）

要求：镜头之间人物外观描述保持一致；场景可切换，但主题连贯；每条提示词都能单独出片且贴近主题。`;
}
