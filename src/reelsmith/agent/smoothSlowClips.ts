// RS-1259: smooth slow motion in a director build. A slowed clip (velocity, speed-ramp, a shot list's "slow motion 50%")
// showed each source frame several times; before the build is committed, each one is swapped for a smooth copy of the
// span it shows (in-between frames, made by the local server: server/reelsmith/smoothSlow.ts), played at speed 1. Place,
// look, effects and keyframes stay; the clip remembers what it played before (`props.rsSmooth`).
// A sped-up clip with the motion-blur effect (velocity's fast parts) gets the same treatment: a copy of its span with
// motion blur that follows each moving thing (Apple's VTMotionBlur), in place of the effect's one fixed direction.
import { createMediaSourceRevision } from '../../editor/mediaSourceRevision';
import type { AtomicAction } from '../../editor/reducerActions';
import type { RelinkableTimelineItem } from '../../editor/reducerTimelineHelpers';
import type { TimelineItem } from '../../editor/types';
import { isSlowMotion } from '../../../shared/reelsmith/smoothSlow';
import type { AnalyzeApi } from '../runRecipe';

type Add = Extract<AtomicAction, { type: 'add' }>;

export interface SmoothedSource { src: string; width: number; height: number; frames: number }

/** What a smoothed clip played before: the source, where it started (timeline frames) and its speed. */
export interface SmoothedFrom {
  src: string; srcInFrame?: number; playbackRate: number; width?: number; height?: number;
  /** the amount of the motion-blur effect the copy's own blur replaced */
  motionBlur?: number;
  /** the media pool asset it came from (the smooth copy is not in the pool) */
  assetId?: string;
  sourceRevision?: string; sourceContentHash?: string; sourceSize?: number; sourceModifiedAt?: number; sourceFilename?: string; originalFilePath?: string;
}

export const smoothedFrom = (item: Pick<TimelineItem, 'props'>): SmoothedFrom | undefined => item.props?.rsSmooth as SmoothedFrom | undefined;

/** A video clip that plays its source in slow motion and has not been smoothed yet. */
export function wantsSmoothing(item: Pick<TimelineItem, 'kind' | 'src' | 'playbackRate' | 'props'>): boolean {
  return item.kind === 'video' && !!item.src && isSlowMotion(item.playbackRate) && !smoothedFrom(item);
}

export const MOTION_BLUR_FX = 'builtin:fx-motion-blur';
const blurEffect = (item: Pick<TimelineItem, 'effects'>) => item.effects?.find((e) => e.assetId === MOTION_BLUR_FX);

/** A sped-up video clip with the motion-blur effect (at full strength everywhere), not yet given its own blurred copy. */
export function wantsMotionBlur(item: Pick<TimelineItem, 'kind' | 'src' | 'playbackRate' | 'props' | 'effects'>): boolean {
  const fx = blurEffect(item);
  return item.kind === 'video' && !!item.src && (item.playbackRate ?? 1) > 1 && !!fx && !fx.mix && !smoothedFrom(item);
}

/** The effect's amount (0-12, default 2.5) as the copy's blur strength (1-100); velocity's 2.8x (amount 4.3) is about 50. */
export function motionBlurStrength(amount: number | undefined): number {
  return Math.min(100, Math.max(1, Math.round((amount ?? 2.5) * 12)));
}

/**
 * The clip playing its smooth copy from frame 0 at speed 1 (the copy is exactly its span, already slowed or sped up).
 * `motionBlur`: the copy carries the blur, so the motion-blur effect comes off and its amount is remembered.
 */
export function smoothedItem<T extends TimelineItem>(item: T, copy: SmoothedSource, motionBlur?: number): T {
  const { sourceAssetId, sourceContentHash, originalFilePath, sourceSize, sourceModifiedAt, playbackRate, ...rest } = item as T & RelinkableTimelineItem;
  const from: SmoothedFrom = {
    src: item.src!, srcInFrame: item.srcInFrame, playbackRate: playbackRate ?? 1, width: item.width, height: item.height,
    ...(sourceAssetId ? { assetId: sourceAssetId } : {}), sourceRevision: item.sourceRevision, sourceContentHash, sourceSize, sourceModifiedAt,
    sourceFilename: item.sourceFilename, originalFilePath, ...(motionBlur !== undefined ? { motionBlur } : {}),
  };
  const effects = motionBlur !== undefined ? rest.effects?.filter((e) => e.assetId !== MOTION_BLUR_FX) : rest.effects;
  return {
    ...rest, src: copy.src, srcInFrame: 0, width: copy.width, height: copy.height,
    ...(motionBlur !== undefined ? { effects: effects?.length ? effects : undefined } : {}),
    // a new revision, so cached frames of the slowed clip are not shown for the copy
    sourceRevision: createMediaSourceRevision({ src: copy.src, kind: 'video', durationInFrames: copy.frames, width: copy.width, height: copy.height }),
    sourceFilename: decodeURIComponent(copy.src.split('/').pop() ?? ''),
    // RS-1260: a depth track covers a span of the old file; the copy gets its own
    props: { ...Object.fromEntries(Object.entries(item.props ?? {}).filter(([k]) => k !== 'rsDepthTrackSrc')), rsSmooth: from },
  } as unknown as T;
}

/** Requests sent at once (the server makes up to three copies side by side). */
const AT_ONCE = 3;

/**
 * Swap every slowed clip in `actions` (in place) for its smooth copy, and every sped-up clip with the motion-blur effect
 * for a copy blurred along its motion. Returns notes for the build report.
 */
export async function smoothSlowClips(actions: AtomicAction[], api: Pick<AnalyzeApi, 'smoothSlow' | 'motionBlur'>, fps: number, onProgress?: (msg: string) => void): Promise<string[]> {
  const adds = actions.filter((a): a is Add => a.type === 'add');
  const jobs = [
    ...(api.smoothSlow ? adds.filter((a) => wantsSmoothing(a.item as TimelineItem)).map((a) => ({ a, blur: false })) : []),
    ...(api.motionBlur ? adds.filter((a) => wantsMotionBlur(a.item as TimelineItem)).map((a) => ({ a, blur: true })) : []),
  ];
  if (!jobs.length) return [];
  const slow = jobs.filter((j) => !j.blur).length, fast = jobs.length - slow;
  const plural = (n: number) => `${n} clip${n === 1 ? '' : 's'}`;
  onProgress?.(slow && fast ? `Smoothing the slow motion (${plural(slow)}) and blurring the fast parts (${plural(fast)})`
    : slow ? `Smoothing the slow motion (${plural(slow)})` : `Blurring the fast parts (${plural(fast)})`);
  const failed: string[] = [];
  // not possible on this Mac: no clip of that kind can be done, so stop asking after the first answer says so
  const unavailable: Record<'slow' | 'blur', string | null> = { slow: null, blur: null };
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { a, blur } = jobs[next++]!;
      if (unavailable[blur ? 'blur' : 'slow']) continue;
      const item = a.item as TimelineItem;
      const startSec = (item.srcInFrame ?? 0) / fps;
      const amount = blur ? blurEffect(item)?.overrides?.amount : undefined;
      const r = await (blur
        ? api.motionBlur!(item.src!, startSec, item.playbackRate!, item.durationInFrames, fps, motionBlurStrength(typeof amount === 'number' ? amount : undefined))
        : api.smoothSlow!(item.src!, startSec, item.playbackRate!, item.durationInFrames, fps))
        .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
      if ('skipped' in r) { if (r.unavailable) unavailable[blur ? 'blur' : 'slow'] = r.skipped; continue; }
      if ('error' in r) { failed.push(blur ? `the fast part of ${item.name} keeps the plain motion blur: ${r.error}` : `the slow motion of ${item.name} repeats frames: ${r.error}`); continue; }
      a.item = smoothedItem(item, r, blur ? (typeof amount === 'number' ? amount : 2.5) : undefined) as Add['item'];
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, jobs.length) }, worker));
  return [
    ...(unavailable.slow ? [`slow motion repeats frames: ${unavailable.slow}`] : []),
    ...(unavailable.blur ? [`fast parts keep the plain motion blur: ${unavailable.blur}`] : []),
    ...failed,
  ];
}
