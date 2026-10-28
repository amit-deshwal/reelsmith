// RS-1238: depth maps for clips with a depth effect (photo parallax). The server makes each one once and saves it next to
// the photo (`/api/reelsmith/depth-map`, server/reelsmith/depthMap.ts); the clip carries it as `props.rsDepthSrc`.
// The preview asks for a missing one by itself; an export fills them in first, because the render page cannot ask.
import type { TimelineItem } from '../editor/types';
import { sourceFrameAt } from '../editor/sourceLimit';
import { glEffects } from '../gl/clipEffects';

export const DEPTH_SRC_PROP = 'rsDepthSrc';

/** A clip, placed on the timeline or not yet (a build's add actions carry no startFrame). */
type DepthItem = Omit<TimelineItem, 'startFrame'>;

/** The clip has an effect that reads the depth map. */
export function wantsDepth(item: DepthItem): boolean {
  return (item.kind === 'image' || item.kind === 'video') && !!item.src && glEffects(item as TimelineItem).some(({ def }) => def.needsDepth);
}

export function depthSrcOf(item: DepthItem): string | undefined {
  const v = item.props?.[DEPTH_SRC_PROP];
  return typeof v === 'string' && v ? v : undefined;
}

/** What the depth map is made from: the photo, or the video's frame where the clip starts (steady shots). */
export function depthRequestFor(item: DepthItem, fps: number): { src: string; atSec?: number } | null {
  if (!item.src) return null;
  if (item.kind === 'image') return { src: item.src };
  if (item.kind !== 'video') return null;
  return { src: item.src, atSec: Math.round((sourceFrameAt(item, 0) / Math.max(1, fps)) * 1000) / 1000 };
}

type Fetcher = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

const requests = new Map<string, Promise<string | null>>();

/** The depth map's /media/uploads path, or null when the depth model is not installed or the map cannot be made. */
export function requestDepthMap(req: { src: string; atSec?: number }, fetcher: Fetcher = (i, init) => fetch(i, init)): Promise<string | null> {
  const key = `${req.src}|${req.atSec ?? ''}`;
  let pending = requests.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetcher('/api/reelsmith/depth-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        const body = await res.json() as { available?: boolean; src?: string };
        return res.ok && body.available && typeof body.src === 'string' ? body.src : null;
      } catch {
        return null;
      }
    })();
    requests.set(key, pending);
    // a miss is asked again next time (the pack may have been installed since)
    void pending.then((src) => { if (!src) requests.delete(key); });
  }
  return pending;
}

/** The clip with its depth map attached (unchanged when it needs none, has one, or none can be made). */
export async function withDepthMap<T extends DepthItem>(item: T, fps: number, fetcher?: Fetcher): Promise<T> {
  if (!wantsDepth(item) || depthSrcOf(item)) return item;
  const req = depthRequestFor(item, fps);
  const src = req ? await requestDepthMap(req, fetcher) : null;
  return src ? { ...item, props: { ...item.props, [DEPTH_SRC_PROP]: src } } : item;
}

/**
 * A copy of an export's state where every clip with a depth effect carries its depth map (the timeline and any nested
 * sequence timelines). Returns the same object when nothing changed.
 */
export async function withDepthMaps<S>(state: S, fetcher?: Fetcher): Promise<S> {
  const fpsOf = (timeline: Record<string, unknown>, fallback: number) => (typeof timeline.fps === 'number' && timeline.fps > 0 ? timeline.fps : fallback);
  // a list or an id-keyed map of timelines
  const visitContainer = async (value: unknown, fps: number): Promise<unknown> => {
    if (Array.isArray(value)) {
      const out = await Promise.all(value.map((v) => visitTimeline(v, fps)));
      return out.every((v, i) => v === value[i]) ? value : out;
    }
    if (!value || typeof value !== 'object') return value;
    const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await visitTimeline(v, fps)] as const));
    return entries.every(([k, v]) => v === (value as Record<string, unknown>)[k]) ? value : Object.fromEntries(entries);
  };
  const visitTimeline = async (value: unknown, fps: number): Promise<unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const ownFps = fpsOf(record, fps);
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      let next: unknown = child;
      if (key === 'items' && Array.isArray(child)) {
        const items = await Promise.all(child.map((item) => (item && typeof item === 'object' ? withDepthMap(item as TimelineItem, ownFps, fetcher) : item)));
        next = items.every((v, i) => v === child[i]) ? child : items;
      } else if (key === 'timelines' || key === 'sequenceTimelines' || key === 'sequences' || key === 'timelineById') {
        next = await visitContainer(child, ownFps);
      }
      if (next !== child) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  };
  return await visitTimeline(state, 30) as S;
}
