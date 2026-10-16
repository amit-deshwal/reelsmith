// RS-109: what a clip shows, from the local visual model's image vectors (upstream semantic search, Chinese-CLIP).
// Zero-shot: each tag has a few text prompts; a sample's tag scores are a CLIP-style softmax over tags.
// The prompts are Chinese because the model's text tower is Chinese-RoBERTa; English labels are for the UI.
import { normalizeVector, dot } from '../media/semantic-search/vectorSearch';

export const SHOT_TAGS = ['scenery', 'people', 'portrait', 'action', 'food', 'detail', 'city', 'water', 'night', 'laughing', 'shouting', 'falling', 'dancing', 'celebrating', 'posing'] as const;
/** Tags for people doing something worth watching (used by character-driven recipes to prefer them over scenery). */
export const CHARACTER_TAGS: readonly ShotTag[] = ['laughing', 'shouting', 'falling', 'dancing', 'celebrating', 'posing', 'portrait', 'action'];
export type ShotTag = typeof SHOT_TAGS[number];

export const SHOT_TAG_INFO: Record<ShotTag, { label: string; prompts: string[] }> = {
  scenery: { label: 'wide scenery', prompts: ['一张广阔的自然风景照片', '远处的山脉和天空', '航拍的风景'] },
  people: { label: 'group of people', prompts: ['一群朋友的合影', '几个人站在一起', '一群人在户外'] },
  portrait: { label: 'face / selfie', prompts: ['一个人的自拍', '一个人的脸部特写'] },
  action: { label: 'person moving', prompts: ['一个人在走路', '一个人在跑步或跳跃', '一个人在徒步登山'] },
  food: { label: 'food and drink', prompts: ['一盘美食', '桌上的食物和饮料', '一杯咖啡'] },
  detail: { label: 'close-up detail', prompts: ['物品的近距离特写', '手里拿着的东西', '花朵或植物的特写'] },
  city: { label: 'street / buildings', prompts: ['城市街道和建筑', '热闹的街头', '一座古老的建筑或寺庙'] },
  water: { label: 'beach / water', prompts: ['海边的沙滩和海浪', '湖泊或河流', '瀑布'] },
  night: { label: 'night lights', prompts: ['夜晚的城市灯光', '夜景', '篝火或烟花'] },
  laughing: { label: 'laughing', prompts: ['一个人开怀大笑', '一群朋友笑得前仰后合'] },
  shouting: { label: 'shouting / big reaction', prompts: ['一个人张大嘴巴大喊大叫', '夸张搞怪的表情'] },
  falling: { label: 'falling / slipping', prompts: ['一个人摔倒在地', '有人滑倒或跌倒'] },
  dancing: { label: 'dancing', prompts: ['一个人在跳舞', '几个人一起跳舞'] },
  celebrating: { label: 'cheering / summit pose', prompts: ['登顶后高举双手欢呼庆祝', '一群人欢呼击掌'] },
  posing: { label: 'posing', prompts: ['一个人摆拍姿势', '戴着墨镜的人在摆造型'] },
};

/** Normalised text vectors per tag (one per prompt). */
export type TagPrompts = Record<ShotTag, number[][]>;

/** Per-clip result: mean tag probability over its samples, and the strongest tag. */
export interface ClipShotTags {
  scores: Record<ShotTag, number>;
  top: ShotTag;
  /** probability of `top`, 0..1 */
  confidence: number;
  samples: number;
}

/** CLIP's learned logit scale (≈100); keeps the softmax as sharp as the model was trained for. */
const LOGIT_SCALE = 100;

export async function embedTagPrompts(embedText: (text: string) => Promise<number[]>): Promise<TagPrompts> {
  const out = {} as TagPrompts;
  for (const tag of SHOT_TAGS) {
    out[tag] = [];
    for (const p of SHOT_TAG_INFO[tag].prompts) out[tag].push(normalizeVector(await embedText(p)));
  }
  return out;
}

/** Tag probabilities for one image vector (sum to 1). */
export function tagSample(vector: ArrayLike<number>, prompts: TagPrompts): Record<ShotTag, number> {
  const v = normalizeVector(vector);
  const logits = SHOT_TAGS.map((t) => LOGIT_SCALE * Math.max(...prompts[t].map((p) => dot(v, p))));
  const m = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return Object.fromEntries(SHOT_TAGS.map((t, i) => [t, e[i]! / sum])) as Record<ShotTag, number>;
}

/** Average the sample probabilities of each asset. Assets without vectors are left out. */
export function tagClips(
  records: ReadonlyArray<{ assetId: string; vector: ArrayLike<number> }>, prompts: TagPrompts,
): Map<string, ClipShotTags> {
  const sums = new Map<string, { s: Record<ShotTag, number>; n: number }>();
  for (const r of records) {
    const p = tagSample(r.vector, prompts);
    const acc = sums.get(r.assetId) ?? { s: Object.fromEntries(SHOT_TAGS.map((t) => [t, 0])) as Record<ShotTag, number>, n: 0 };
    for (const t of SHOT_TAGS) acc.s[t] += p[t];
    acc.n += 1;
    sums.set(r.assetId, acc);
  }
  const out = new Map<string, ClipShotTags>();
  for (const [id, { s, n }] of sums) {
    const scores = Object.fromEntries(SHOT_TAGS.map((t) => [t, s[t] / n])) as Record<ShotTag, number>;
    const top = SHOT_TAGS.reduce((a, b) => (scores[b] > scores[a] ? b : a));
    out.set(id, { scores, top, confidence: scores[top], samples: n });
  }
  return out;
}
