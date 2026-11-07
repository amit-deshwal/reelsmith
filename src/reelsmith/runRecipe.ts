// Turns what the Recipes panel has (pool assets + setup values) into an AssembleInput, runs the assembler,
// and returns one batch action ready for `commands.batch`. Analysis calls are injected so this stays testable.
import type { ReelPlan } from '../../shared/reelsmith/directorPlan';
import { recipeForRatio, type Recipe } from '../../shared/reelsmith/recipe';
import type { RatioId } from '../../shared/reelsmith/ratios';
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import type { MediaAsset } from '../editor/types';
import { assemble, type AssembleInput, type AssembleResult, type AssemblyClip, type AssemblyMusic, type RecipeRunRecord } from './assembler';
import type { AssemblyVoiceover } from './assembler/types';
import { toAssemblyClips, type ClipFeatures } from './assembler/scoring';
import type { ClipShotTags } from './shotTags';
import { validateSetup, type SetupValues } from './setupForm';
import { fillTransformForFocus } from './cropFocus';
import type { TimelineItem } from '../editor/types';
import { withFrontCutouts } from './director/frontCutout';
import { UPSCALE_SOFT } from './qualityLint';
import { focusForRange, withTitleClear } from './titleClear';
import { matchEffect, planShotMatch, type ColorStats } from './shotMatch';
import { withRecipeLook } from './recipeLook';
import type { BrandKit } from '../../shared/reelsmith/brandKit';

export interface AnalyzeApi {
  clipFeatures(asset: MediaAsset, fps: number): Promise<ClipFeatures | null>;
  /** RS-109: what each clip shows, when the visual model has indexed them (empty otherwise) */
  shotTags?(assets: MediaAsset[], onProgress?: (text: string) => void): Promise<Map<string, ClipShotTags>>;
  /** 2x enhanced copy of a small photo (null when enhancement is not installed or fails); the original is left alone */
  upscale?(asset: MediaAsset): Promise<{ src: string; width: number; height: number } | null>;
  musicGrid(asset: MediaAsset): Promise<Omit<AssemblyMusic, 'assetId' | 'name' | 'src'> | null>;
  /** A still image of one moment of a video, saved as a new upload (freeze frames); null when it cannot be read */
  stillFrame?(asset: Pick<MediaAsset, 'src'>, atSec: number): Promise<{ src: string; width: number; height: number } | null>;
  /** RS-1223: a reversed copy of `frames` frames of the source from `startSec` (its error message on failure) */
  reverseClip?(src: string, startSec: number, frames: number, fps: number): Promise<{ src: string; width: number; height: number; frames: number } | { error: string }>;
  /**
   * RS-1259: a smooth copy (in-between frames, already slowed, at `fps`) of the `frames` reel frames a clip shows from
   * `startSec` at speed `rate`; `skipped` when it is not needed or not possible here (`unavailable`), its error on failure
   */
  smoothSlow?(src: string, startSec: number, rate: number, frames: number, fps: number): Promise<{ src: string; width: number; height: number; frames: number } | { skipped: string; unavailable?: boolean } | { error: string }>;
  /** RS-1259 follow-up: a copy of a sped-up clip's span (`rate` over 1) with motion blur of `strength` (1-100) along the motion, played at 1x */
  motionBlur?(src: string, startSec: number, rate: number, frames: number, fps: number, strength: number): Promise<{ src: string; width: number; height: number; frames: number } | { skipped: string; unavailable?: boolean } | { error: string }>;
  /** RS-1259 follow-up: `frames` silent frames at `fps` morphing from the source moment `fromSec` to `toSec` (a smooth cut over a jump) */
  smoothCut?(src: string, fromSec: number, toSec: number, frames: number, fps: number): Promise<{ src: string; width: number; height: number; frames: number } | { skipped: string; unavailable?: boolean } | { error: string }>;
  /** One numbered contact sheet per 20 candidates (agent shot selection); null when the server cannot build it */
  /** RS-1217: a reference reel's cuts and whole-reel colour (more sensitive than clipFeatures' in-clip cuts) */
  referenceCuts?(asset: MediaAsset, fps: number): Promise<{ cutsFrame: number[]; color?: { r: number; g: number; b: number } } | null>;
  /** RS-1239: the brand kit of one public page the user named (promo reels) */
  brandKit?(url: string): Promise<BrandKit | { error: string }>;
  /** RS-1250: each source's frame rate, in order (null when unreadable) */
  mediaFps?(srcs: string[]): Promise<Array<number | null>>;
  /** RS-1251: share of an audio file's seconds that are speech (0..1), to tell a narration from a song; null when unreadable */
  speechShare?(asset: MediaAsset): Promise<number | null>;
  /** RS-1251: word-timed transcript (source ms) of a narration; null when no speech model is available */
  transcribe?(asset: MediaAsset, onProgress?: (text: string) => void, opts?: { language?: string }): Promise<Array<{ text: string; start: number; end: number }> | null>;
  selectionSheet?(items: Array<{ asset: MediaAsset; atSec: number; label: string }>): Promise<{ sheets: Array<{ base64: string; labels: string[] }>; skipped: string[] } | null>;
}

export interface RunOptions {
  recipe: Recipe;
  /** RS-901: output shape; defaults to the recipe's own canvas */
  ratio?: RatioId;
  values: SetupValues;
  assets: MediaAsset[];
  /** timeline fps; the recipe's frame math follows the timeline */
  fps: number;
  /** clear existing items first */
  replaceTimeline: boolean;
  seed?: number;
  /** RS-1201: the agent's plan for a director@1 run */
  plan?: ReelPlan;
  /** RS-1251: the plan's voiceover, resolved to its file and transcript */
  voiceover?: AssemblyVoiceover;
  /** RS-1253: the song's words for a lyric reel (ms in the song file) */
  lyrics?: AssemblyMusic['lyrics'];
  /** M12: song seconds where each sung phrase starts, so the director's lines come in with the singer */
  vocalStarts?: number[];
  onProgress?: (text: string) => void;
}

export interface RunOutcome {
  result: AssembleResult;
  /** batch to dispatch, with canvas set and (optionally) the timeline cleared */
  action: BatchAction | null;
  messages: string[];
  /** what to save with the project (RS-108) */
  run: RecipeRunRecord;
  /** director@1: the plan that was built */
  plan?: ReelPlan;
}

export interface Prepared {
  input: AssembleInput;
  messages: string[];
}

/** Clips analysed at once (each is an ffmpeg decode on the server). */
const ANALYSIS_CONCURRENCY = 3;
const timelineKind = (a: MediaAsset): 'video' | 'image' | null => (a.kind === 'video' ? 'video' : a.kind === 'image' ? 'image' : null);

/** Analyse the chosen media and build the assembler input (no timeline changes). */
/** Recipe param (boolean): enhance photos that would be enlarged a lot (2x, slower). */
export const ENHANCE_PHOTOS_PARAM = 'enhanceSmallPhotos';
/** A photo whose cover crop would be enlarged more than this is worth enhancing (below it plain resizing is fine). */
export const ENHANCE_ABOVE = 1.4;
export const coverEnlargement = (w: number, h: number, canvas: { width: number; height: number }) => (w > 0 && h > 0 ? Math.max(canvas.width / w, canvas.height / h) : 0);

export async function prepareAssembly(api: AnalyzeApi, o: RunOptions): Promise<Prepared> {
  const shaped = o.ratio ? recipeForRatio(o.recipe, o.ratio) : o.recipe;
  if (!shaped) throw new Error(`${o.recipe.name} is not available in ${o.ratio}`);
  const recipe: Recipe = { ...shaped, canvas: { ...shaped.canvas, fps: { num: o.fps, den: 1 } } };
  const byId = new Map(o.assets.map((a) => [a.id, a]));
  const messages: string[] = [];
  const pick = (inputId: string) => (o.values.media[inputId] ?? []).map((m) => byId.get(m.assetId)).filter((a): a is MediaAsset => !!a);

  const mediaInputs = recipe.inputs.filter((i) => i.kind === 'media');
  const musicInput = recipe.music?.inputId ? mediaInputs.find((i) => i.id === recipe.music!.inputId) : undefined;
  const clipInputs = mediaInputs.filter((i) => i !== musicInput);

  // 1. analyse clips (score, near-duplicates)
  const base: Array<Omit<AssemblyClip, 'score' | 'groupId' | 'bestStartFrame' | 'captureTimeMs'> & { input: string }> = [];
  for (const input of clipInputs) {
    for (const a of pick(input.id)) {
      const kind = timelineKind(a);
      if (kind) base.push({ assetId: a.id, name: a.name, src: a.src, kind, width: a.width, height: a.height, durationInFrames: a.durationInFrames, input: input.id, ...(a.transcript?.length ? { transcript: a.transcript } : {}) });
    }
  }
  // a few clips at a time: each is one ffmpeg decode, and 3 in flight is ~2x faster than 1 on 4K footage
  const results: Array<ClipFeatures | null> = new Array(base.length).fill(null);
  let next = 0;
  let done = 0;
  o.onProgress?.(`Analysing clips 0/${base.length}`);
  await Promise.all(Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, base.length) }, async () => {
    while (next < base.length) {
      const i = next++;
      results[i] = await api.clipFeatures(byId.get(base[i]!.assetId)!, o.fps).catch(() => null);
      o.onProgress?.(`Analysing clips ${++done}/${base.length}`);
    }
  }));
  const features: ClipFeatures[] = [];
  base.forEach((b, i) => {
    const f = results[i];
    if (f) features.push({ ...f, assetId: b.assetId });
    else messages.push(`${b.name}: could not be analysed, using a neutral score`);
  });
  const minShot = Math.max(1, Math.round(o.fps * (clipInputs[0]?.kind === 'media' ? clipInputs[0].constraints?.minClipSec ?? 0.3 : 0.3)));
  const tags = await (api.shotTags?.(base.map((b) => byId.get(b.assetId)!), o.onProgress) ?? Promise.resolve(new Map<string, ClipShotTags>())).catch(() => new Map<string, ClipShotTags>());
  const scored = toAssemblyClips(base.map(({ input: _i, ...rest }) => rest), features, minShot, undefined, recipe.canvas.width / recipe.canvas.height);
  // optional: enhance photos that would be enlarged a lot, so they stay full-bleed and sharper instead of soft or blurred-fit
  if (o.values.params[ENHANCE_PHOTOS_PARAM] === true && api.upscale) {
    let enhanced = 0;
    for (let i = 0; i < scored.length; i += 1) {
      const c = scored[i]!;
      if (c.kind !== 'image' || coverEnlargement(c.width ?? 0, c.height ?? 0, recipe.canvas) <= ENHANCE_ABOVE) continue;
      o.onProgress?.(`Enhancing small photos ${enhanced + 1}`);
      const up = await api.upscale(byId.get(c.baseAssetId ?? c.assetId)!).catch(() => null);
      if (up) { scored[i] = { ...c, src: up.src, width: up.width, height: up.height }; enhanced += 1; }
    }
    if (enhanced) messages.push(`Enhanced ${enhanced} small photo${enhanced === 1 ? '' : 's'} 2x (copies; your originals are unchanged).`);
  }
  // clips without features keep a neutral score so they are still usable
  const clips = scored.map((c) => {
    const t = tags.get(c.assetId);
    const color = features.find((f) => f.assetId === c.assetId)?.color;
    const withTag = { ...c, ...(color ? { color } : {}), ...(t ? { shot: { top: t.top, confidence: t.confidence, scores: t.scores } } : {}) };
    return features.some((f) => f.assetId === c.assetId) ? withTag : { ...withTag, score: 0.5 };
  });
  const primary = clips.filter((c) => base.find((b) => b.assetId === c.assetId)?.input === clipInputs[0]?.id);
  const secondary = clips.filter((c) => base.find((b) => b.assetId === c.assetId)?.input !== clipInputs[0]?.id);

  // 2. music grid
  let music: AssemblyMusic | undefined;
  const musicAsset = musicInput ? pick(musicInput.id)[0] : undefined;
  if (musicAsset) {
    o.onProgress?.('Finding the beat');
    const grid = await api.musicGrid(musicAsset).catch(() => null);
    if (grid) music = { assetId: musicAsset.id, name: musicAsset.name, src: musicAsset.src, ...grid, ...(o.lyrics?.length ? { lyrics: o.lyrics } : {}), ...(o.vocalStarts?.length ? { vocalStarts: o.vocalStarts } : {}) };
    else messages.push('Could not find a steady beat in the song');
  }

  return {
    messages,
    input: {
      recipe, clips: primary, broll: secondary, music,
      texts: o.values.texts, params: o.values.params, seed: o.seed ?? 1,
      ...(o.plan ? { plan: o.plan } : {}),
      ...(o.voiceover ? { voiceover: o.voiceover } : {}),
    },
  };
}

/** The saved run: the assembler's record plus which assets went into which input. */
export function runRecord(result: AssembleResult, values: SetupValues): RecipeRunRecord {
  const media = Object.fromEntries(Object.entries(values.media).map(([k, v]) => [k, v.map((m) => m.assetId)]));
  return { ...result.run, media };
}

/** Put the song's beat grid on the music clip so snapping (RS-403) works without re-analysis. */
export function withBeatGrid(actions: AtomicAction[], music: AssemblyMusic | undefined): AtomicAction[] {
  if (!music) return actions;
  const rsBeats = { beatTimesSec: music.beatTimesSec, beatsPerBar: music.beatsPerBar, downbeatIndex: music.downbeatIndex };
  return actions.map((a) => (a.type === 'add' && a.item.kind === 'audio' && a.item.sourceAssetId === music.assetId
    ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), rsBeats } } }
    : a));
}

/** Fill the canvas with each selected shot, panned to its face/subject in the source range it plays. */
export const MISMATCH_FIT_PARAM = 'mismatchFit';
/** RS-903: how clips whose shape differs from the canvas are framed: cropped to fill, or fitted whole over a blurred copy. */
export type MismatchFit = 'fill' | 'blur' | 'auto';
/** 'auto' (the default) crops to fill but fits the whole picture over a blurred copy when filling would enlarge it past the soft limit. */
export const mismatchFitOf = (params: Record<string, unknown>): MismatchFit => params[MISMATCH_FIT_PARAM] === 'blur' ? 'blur' : params[MISMATCH_FIT_PARAM] === 'fill' ? 'fill' : 'auto';

/** Blurred fit for this clip? Always for 'blur', never for 'fill', and for 'auto' when the cover crop would be soft. */
export function usesBlurFit(fit: MismatchFit, sourceWidth: number, sourceHeight: number, canvas: { width: number; height: number }, fillScale: number): boolean {
  if (fit !== 'auto') return fit === 'blur';
  if (!(sourceWidth > 0 && sourceHeight > 0)) return false;
  return Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight) * fillScale > UPSCALE_SOFT;
}

export function withCropFocus(actions: AtomicAction[], clips: AssemblyClip[], canvas: { width: number; height: number }, fit: MismatchFit = 'fill'): AtomicAction[] {
  const byId = new Map(clips.map((clip) => [clip.assetId, clip]));
  // shot matching works on whole source assets: extra moments of one long video share its colour
  const stats = new Map<string, ColorStats>();
  for (const clip of clips) if (clip.color) stats.set(clip.baseAssetId ?? clip.assetId, clip.color);
  const matches = planShotMatch(stats);
  return actions.map((action) => {
    if (action.type !== 'add' || (action.item.kind !== 'video' && action.item.kind !== 'image')) return action;
    const clip = action.item.sourceAssetId ? byId.get(action.item.sourceAssetId) : undefined;
    if (!clip) return action;
    const start = action.item.srcInFrame ?? 0;
    const end = start + action.item.durationInFrames * (action.item.playbackRate ?? 1);
    const gain = matches.get(clip.baseAssetId ?? clip.assetId);
    const focus = focusForRange(clip, start, end);
    const fill = fillTransformForFocus(clip.width ?? 0, clip.height ?? 0, canvas.width, canvas.height, focus);
    const blur = !!fill && usesBlurFit(fit, clip.width ?? 0, clip.height ?? 0, canvas, fill.scale);
    return { ...action, item: { ...action.item,
      width: action.item.width ?? clip.width, height: action.item.height ?? clip.height,
      ...(gain && !action.item.effects?.length ? { effects: [matchEffect(gain)] } : {}),
      // Slot-placed clips (collage cells, split-screen halves) already carry their own transform: leave them.
      ...(fill && !action.item.transform && blur ? { backgroundFill: true } : {}),
      ...(fill && !action.item.transform && !blur ? fillPlacement(action.item, fill) : {}),
    } };
  });
}



/**
 * The cover placement of a clip. A clip that animates its scale (a push in, a punch, a 3D zoom) gets the cover scale folded
 * into its scale keyframes instead: the editor takes a fixed transform scale over a scale keyframe, so the move would freeze.
 */
function fillPlacement(item: Pick<TimelineItem, 'keyframes'>, fill: { scale: number; x: number; y: number }): Pick<TimelineItem, 'transform' | 'keyframes'> {
  const kfs = item.keyframes?.scale;
  if (!kfs?.length) return { transform: { scale: fill.scale, scaleX: fill.scale, scaleY: fill.scale, x: fill.x, y: fill.y } };
  return { transform: { x: fill.x, y: fill.y }, keyframes: { ...item.keyframes, scale: kfs.map((k) => ({ ...k, value: k.value * fill.scale })) } };
}

export async function runRecipe(api: AnalyzeApi, o: RunOptions): Promise<RunOutcome> {
  const errors = validateSetup(o.recipe, o.values, o.assets);
  if (errors.length) throw new Error(errors.map((e) => `${o.recipe.inputs.find((i) => i.id === e.field)?.label ?? o.recipe.params.find((p) => p.id === e.field)?.label ?? e.field}: ${e.message}`).join('; '));
  const { input, messages } = await prepareAssembly(api, o);
  o.onProgress?.('Assembling');
  const result = assemble(input);
  messages.push(...result.report.warnings);
  const run = runRecord(result, o.values);
  if (!result.action) return { result, action: null, messages, run };

  const prefix: AtomicAction[] = [
    ...(o.replaceTimeline ? [{ type: 'clear' } as AtomicAction] : []),
    { type: 'setCanvas', width: input.recipe.canvas.width, height: input.recipe.canvas.height, fit: 'cover' } as AtomicAction,
  ];
  return {
    result, messages, run, ...(input.plan ? { plan: input.plan } : {}),
    action: { type: 'batch', label: result.action.label, actions: [...prefix, ...withFrontCutouts(withRecipeLook(withTitleClear(withCropFocus(withBeatGrid(result.action.actions, input.music), [...input.clips, ...(input.broll ?? [])], input.recipe.canvas, mismatchFitOf(o.values.params)), [...input.clips, ...(input.broll ?? [])], input.recipe.canvas), input.recipe))] },
  };
}
