// RS-1259: smooth slow motion in a director build. A slowed clip (velocity, speed-ramp, a shot list's "slow motion 50%")
// showed each source frame several times; before the build is committed, each one is swapped for a smooth copy of the
// span it shows (in-between frames, made by the local server: server/reelsmith/smoothSlow.ts), played at speed 1. Place,
// look, effects and keyframes stay; the clip remembers what it played before (`props.rsSmooth`).
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
  /** the media pool asset it came from (the smooth copy is not in the pool) */
  assetId?: string;
  sourceRevision?: string; sourceContentHash?: string; sourceSize?: number; sourceModifiedAt?: number; sourceFilename?: string; originalFilePath?: string;
}

export const smoothedFrom = (item: Pick<TimelineItem, 'props'>): SmoothedFrom | undefined => item.props?.rsSmooth as SmoothedFrom | undefined;

/** A video clip that plays its source in slow motion and has not been smoothed yet. */
export function wantsSmoothing(item: Pick<TimelineItem, 'kind' | 'src' | 'playbackRate' | 'props'>): boolean {
  return item.kind === 'video' && !!item.src && isSlowMotion(item.playbackRate) && !smoothedFrom(item);
}

/** The clip playing its smooth copy from frame 0 at speed 1 (the copy is exactly its span, already slowed). */
export function smoothedItem<T extends TimelineItem>(item: T, copy: SmoothedSource): T {
  const { sourceAssetId, sourceContentHash, originalFilePath, sourceSize, sourceModifiedAt, playbackRate, ...rest } = item as T & RelinkableTimelineItem;
  const from: SmoothedFrom = {
    src: item.src!, srcInFrame: item.srcInFrame, playbackRate: playbackRate ?? 1, width: item.width, height: item.height,
    ...(sourceAssetId ? { assetId: sourceAssetId } : {}), sourceRevision: item.sourceRevision, sourceContentHash, sourceSize, sourceModifiedAt,
    sourceFilename: item.sourceFilename, originalFilePath,
  };
  return {
    ...rest, src: copy.src, srcInFrame: 0, width: copy.width, height: copy.height,
    // a new revision, so cached frames of the slowed clip are not shown for the copy
    sourceRevision: createMediaSourceRevision({ src: copy.src, kind: 'video', durationInFrames: copy.frames, width: copy.width, height: copy.height }),
    sourceFilename: decodeURIComponent(copy.src.split('/').pop() ?? ''),
    // RS-1260: a depth track covers a span of the old file; the copy gets its own
    props: { ...Object.fromEntries(Object.entries(item.props ?? {}).filter(([k]) => k !== 'rsDepthTrackSrc')), rsSmooth: from },
  } as unknown as T;
}

/** Requests sent at once (the server makes up to three copies side by side). */
const AT_ONCE = 3;

/** Swap every slowed clip in `actions` (in place) for its smooth copy. Returns notes for the build report. */
export async function smoothSlowClips(actions: AtomicAction[], api: Pick<AnalyzeApi, 'smoothSlow'>, fps: number, onProgress?: (msg: string) => void): Promise<string[]> {
  const slowed = actions.filter((a): a is Add => a.type === 'add' && wantsSmoothing(a.item as TimelineItem));
  if (!slowed.length || !api.smoothSlow) return [];
  const smoothSlow = api.smoothSlow.bind(api);
  onProgress?.(`Smoothing the slow motion (${slowed.length} clip${slowed.length === 1 ? '' : 's'})`);
  const failed: string[] = [];
  let unavailable: string | null = null;
  let next = 0;
  const worker = async () => {
    // not possible on this Mac: no clip can be smoothed, so stop asking after the first answer says so
    while (next < slowed.length && !unavailable) {
      const a = slowed[next++]!;
      const item = a.item as TimelineItem;
      const r = await smoothSlow(item.src!, (item.srcInFrame ?? 0) / fps, item.playbackRate!, item.durationInFrames, fps)
        .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
      if ('skipped' in r) { if (r.unavailable) unavailable = r.skipped; continue; }
      if ('error' in r) { failed.push(`the slow motion of ${item.name} repeats frames: ${r.error}`); continue; }
      a.item = smoothedItem(item, r) as Add['item'];
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, slowed.length) }, worker));
  return unavailable ? [`slow motion repeats frames: ${unavailable}`, ...failed] : failed;
}
