// RS-1001: a typed, validated creative brief that can be attached to a recipe run.
import type { Recipe, RecipeMediaInput, RecipeTextInput } from './recipe';

export type BriefRatio = '9:16' | '3:4' | '4:5' | '1:1' | '16:9' | '4:3';
export type BriefShotType = 'wide' | 'close-up' | 'selfie' | 'walking' | 'people' | 'scenery' | 'food' | 'detail' | 'any';

export interface BriefClipRequest {
  count: number;
  shotType: BriefShotType;
  minLengthSec?: number;
}

export type BriefMusicRequest =
  | { mode: 'named'; name: string; bpm?: [number, number]; dropAtSec?: number }
  | { mode: 'vibe'; description: string; bpm?: [number, number]; dropAtSec?: number }
  | { mode: 'instagram'; bpm?: [number, number]; dropAtSec?: number };

export interface BriefTextRequest {
  count: number;
  maxWords?: number;
  tone?: string;
}

export interface ReelsBrief {
  version: 1;
  target: { recipeId: string | 'new'; ratio: BriefRatio };
  clips: BriefClipRequest[];
  music?: BriefMusicRequest;
  text?: BriefTextRequest[];
  whyTrending?: string;
  sources?: Array<{ title: string; url: string; publishedAt?: string }>;
}

export type BriefValidation = { ok: true; brief: ReelsBrief } | { ok: false; errors: string[] };

const SHOT_TYPES = new Set<BriefShotType>(['wide', 'close-up', 'selfie', 'walking', 'people', 'scenery', 'food', 'detail', 'any']);
const RATIOS = new Set<BriefRatio>(['9:16', '3:4', '4:5', '1:1', '16:9', '4:3']);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const boundedInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const shortText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function onlyKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}/${key} is not allowed`);
}

/** Validate untrusted JSON without coercing it or discarding unknown fields. */
export function validateBrief(value: unknown): BriefValidation {
  const errors: string[] = [];
  if (!object(value)) return { ok: false, errors: ['brief must be an object'] };
  onlyKeys(value, ['version', 'target', 'clips', 'music', 'text', 'whyTrending', 'sources'], '', errors);
  if (value.version !== 1) errors.push('version must be 1');
  if (!object(value.target)) errors.push('target must be an object');
  else {
    onlyKeys(value.target, ['recipeId', 'ratio'], 'target', errors);
    if (value.target.recipeId !== 'new' && !(typeof value.target.recipeId === 'string' && /^[a-z0-9][a-z0-9-]{2,63}$/.test(value.target.recipeId))) errors.push('target.recipeId must be "new" or a recipe id');
    if (!RATIOS.has(value.target.ratio as BriefRatio)) errors.push('target.ratio is not supported');
  }
  if (!Array.isArray(value.clips) || value.clips.length > 20) errors.push('clips must be an array with at most 20 requests');
  else value.clips.forEach((clip, i) => {
    if (!object(clip)) { errors.push(`clips/${i} must be an object`); return; }
    onlyKeys(clip, ['count', 'shotType', 'minLengthSec'], `clips/${i}`, errors);
    if (!boundedInt(clip.count, 1, 100)) errors.push(`clips/${i}/count must be an integer from 1 to 100`);
    if (!SHOT_TYPES.has(clip.shotType as BriefShotType)) errors.push(`clips/${i}/shotType is not supported`);
    if (clip.minLengthSec !== undefined && !(typeof clip.minLengthSec === 'number' && Number.isFinite(clip.minLengthSec) && clip.minLengthSec > 0 && clip.minLengthSec <= 600)) errors.push(`clips/${i}/minLengthSec must be greater than 0 and at most 600`);
  });
  if (value.music !== undefined) {
    const music = value.music;
    if (!object(music) || !['named', 'vibe', 'instagram'].includes(String(music.mode))) errors.push('music.mode must be named, vibe, or instagram');
    else {
      onlyKeys(music, ['mode', 'name', 'description', 'bpm', 'dropAtSec'], 'music', errors);
      if (music.mode === 'named' && !shortText(music.name, 160)) errors.push('music.name is required (max 160 characters)');
      if (music.mode === 'vibe' && !shortText(music.description, 300)) errors.push('music.description is required (max 300 characters)');
      if (music.bpm !== undefined && (!Array.isArray(music.bpm) || music.bpm.length !== 2 || !music.bpm.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 30 && n <= 300) || music.bpm[0] > music.bpm[1])) errors.push('music.bpm must be an ascending pair from 30 to 300');
      if (music.dropAtSec !== undefined && !(typeof music.dropAtSec === 'number' && Number.isFinite(music.dropAtSec) && music.dropAtSec >= 0 && music.dropAtSec <= 600)) errors.push('music.dropAtSec must be from 0 to 600');
    }
  }
  if (value.text !== undefined) {
    if (!Array.isArray(value.text) || value.text.length > 20) errors.push('text must be an array with at most 20 requests');
    else value.text.forEach((request, i) => {
      if (!object(request)) { errors.push(`text/${i} must be an object`); return; }
      onlyKeys(request, ['count', 'maxWords', 'tone'], `text/${i}`, errors);
      if (!boundedInt(request.count, 1, 50)) errors.push(`text/${i}/count must be an integer from 1 to 50`);
      if (request.maxWords !== undefined && !boundedInt(request.maxWords, 1, 100)) errors.push(`text/${i}/maxWords must be from 1 to 100`);
      if (request.tone !== undefined && !shortText(request.tone, 100)) errors.push(`text/${i}/tone must be 1 to 100 characters`);
    });
  }
  if (value.whyTrending !== undefined && !shortText(value.whyTrending, 1000)) errors.push('whyTrending must be 1 to 1000 characters');
  if (value.sources !== undefined) {
    if (!Array.isArray(value.sources) || value.sources.length > 20) errors.push('sources must be an array with at most 20 entries');
    else value.sources.forEach((source, i) => {
      if (!object(source) || !shortText(source.title, 200) || typeof source.url !== 'string') { errors.push(`sources/${i} needs a title and URL`); return; }
      onlyKeys(source, ['title', 'url', 'publishedAt'], `sources/${i}`, errors);
      try { if (!['https:', 'http:'].includes(new URL(source.url).protocol)) errors.push(`sources/${i}/url must use HTTP or HTTPS`); }
      catch { errors.push(`sources/${i}/url must be an absolute URL`); }
      if (source.publishedAt !== undefined && (typeof source.publishedAt !== 'string' || !Number.isFinite(Date.parse(source.publishedAt)))) errors.push(`sources/${i}/publishedAt must be a date`);
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, brief: value as unknown as ReelsBrief };
}

export function parseBrief(text: string): BriefValidation {
  try { return validateBrief(JSON.parse(text)); }
  catch (error) { return { ok: false, errors: [`invalid JSON: ${(error as Error).message}`] }; }
}

export interface BriefRecipeMapping {
  clips: Array<{ request: BriefClipRequest; input: RecipeMediaInput }>;
  music?: RecipeMediaInput;
  text: Array<{ request: BriefTextRequest; input: RecipeTextInput }>;
  warnings: string[];
}

/** Map a brief onto available recipe inputs; report gaps instead of inventing recipe fields. */
export function mapBriefToRecipe(brief: ReelsBrief, recipe: Recipe): BriefRecipeMapping {
  const media = recipe.inputs.filter((input): input is RecipeMediaInput => input.kind === 'media');
  const textInputs = recipe.inputs.filter((input): input is RecipeTextInput => input.kind === 'text');
  const clipInputs = media.filter((input) => input.accept.some((kind) => kind === 'video' || kind === 'image'));
  const audioInput = media.find((input) => input.accept.includes('audio') && input.id === recipe.music?.inputId)
    ?? media.find((input) => input.accept.includes('audio'));
  const clips = brief.clips.map((request) => {
    const words = request.shotType === 'any' ? [] : request.shotType.split('-');
    const input = clipInputs.find((candidate) => words.some((word) => `${candidate.id} ${candidate.label} ${candidate.hint ?? ''}`.toLowerCase().includes(word))) ?? clipInputs[0];
    return input ? { request, input } : null;
  }).filter((entry): entry is { request: BriefClipRequest; input: RecipeMediaInput } => entry !== null);
  const text = (brief.text ?? []).map((request) => {
    const input = textInputs.find((candidate) => request.tone && `${candidate.id} ${candidate.label} ${candidate.placeholder ?? ''}`.toLowerCase().includes(request.tone.toLowerCase())) ?? textInputs[0];
    return input ? { request, input } : null;
  }).filter((entry): entry is { request: BriefTextRequest; input: RecipeTextInput } => entry !== null);
  const warnings: string[] = [];
  if (brief.target.recipeId !== 'new' && brief.target.recipeId !== recipe.id) warnings.push(`Brief targets ${brief.target.recipeId}, but the selected recipe is ${recipe.id}.`);
  const [w, h] = [recipe.canvas.width, recipe.canvas.height];
  const divisor = gcd(w, h);
  const actualRatio = `${w / divisor}:${h / divisor}`;
  if (actualRatio !== brief.target.ratio) warnings.push(`Brief requests ${brief.target.ratio}, but ${recipe.name} currently uses ${actualRatio}.`);
  if (brief.clips.length && !clipInputs.length) warnings.push('The brief requests clips, but this recipe has no video or image input.');
  if ((brief.text?.length ?? 0) > 0 && !textInputs.length) warnings.push('The brief requests text, but this recipe has no text input.');
  if (brief.music && !audioInput) warnings.push('The brief requests music, but this recipe has no audio input.');
  return { clips, music: brief.music && audioInput ? audioInput : undefined, text, warnings };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}
