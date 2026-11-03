// RS-1258: the Director's stage 1 watches every clip (server clip features, the browser's face and person finding, the
// visual model's shot tags) before the agent can plan: 27-60 s of every measured run, the model idle. All three are
// cached by promise (the server's feature cache, the browser's subject cache, one shot-tag reading per project), so the
// Director tab starts the same work while the user writes the story and stage 1 picks it up where it is.
import type { MediaAsset } from '../../editor/types';
import { footageTimelineFps } from './footageRate';

/** What the warm-up needs from the analysis client (the app passes analyzeApi and the shot-tag loader). */
export interface WarmDeps {
  clipFeatures: (asset: MediaAsset, fps: number) => Promise<unknown>;
  mediaFps?: (srcs: string[]) => Promise<Array<number | null>>;
  shotTags?: (projectId: string, assets: MediaAsset[]) => Promise<unknown>;
}

export interface WarmInput {
  projectId: string;
  assets: readonly MediaAsset[];
  /** the open timeline's rate, and whether anything is on it (the editor locks the rate then) */
  fps: number;
  timelineHasItems: boolean;
  /** the reel the user picked as "Feel like": studied, never cast, so it is not warmed as footage */
  referenceId?: string;
}

const VISUAL = new Set(['video', 'image']);

/** The clips stage 1 watches, in its order (directorVisuals): pictures, not the reference, at most 60, uploads done. */
export function warmupVisuals(assets: readonly MediaAsset[], referenceId?: string): MediaAsset[] {
  return assets.filter((a) => VISUAL.has(a.kind) && a.id !== referenceId).slice(0, 60).filter((a) => !!a.src && !a.src.startsWith('blob:'));
}

/** The rate stage 1 analyses at: the footage's 60 fps for an empty timeline of 60 fps clips, else the timeline's (footageRateFor). */
export async function warmupFps(input: Pick<WarmInput, 'assets' | 'fps' | 'timelineHasItems'>, mediaFps?: WarmDeps['mediaFps']): Promise<number> {
  if (input.fps >= 50 || input.timelineHasItems || !mediaFps) return input.fps;
  const videos = input.assets.filter((a) => a.kind === 'video' && a.src && !a.src.startsWith('blob:'));
  if (!videos.length) return input.fps;
  const rates = await mediaFps(videos.map((a) => a.src)).catch(() => [] as Array<number | null>);
  return footageTimelineFps(rates) ?? input.fps;
}

/** Same media, same rate: warmed once (the panel re-renders often). */
const started = new Map<string, Promise<void>>();
export const warmKey = (projectId: string, visuals: readonly MediaAsset[], fps: number) => `${projectId}|${fps}|${visuals.map((a) => `${a.id}:${a.src}`).join(',')}`;

/** Analyse the clips the way stage 1 will (three at a time, like it), and read their shot tags; never throws. */
export function warmDirectorAnalysis(input: WarmInput, deps: WarmDeps): Promise<void> {
  const visuals = warmupVisuals(input.assets, input.referenceId);
  if (!visuals.length || !input.projectId) return Promise.resolve();
  const run = async () => {
    const fps = await warmupFps(input, deps.mediaFps);
    const key = warmKey(input.projectId, visuals, fps);
    const already = started.get(key);
    if (already) return already;
    const work = (async () => {
      const tags = deps.shotTags?.(input.projectId, visuals).catch(() => undefined);
      const videos = visuals.filter((a) => a.kind === 'video');
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, videos.length) }, async () => {
        while (next < videos.length) await deps.clipFeatures(videos[next++]!, fps).catch(() => undefined);
      }));
      await tags;
    })();
    started.set(key, work);
    if (started.size > 20) started.delete(started.keys().next().value!);
    return work;
  };
  return run().catch(() => undefined);
}
