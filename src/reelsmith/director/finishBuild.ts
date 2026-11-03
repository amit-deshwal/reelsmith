// The steps after a director plan is compiled that need the media (people, reversed copies), shared by the agent's
// build (reels_director_build/fix).
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import type { AnalyzeApi } from '../runRecipe';
import { aimMarkers } from './aimMarkers';
import { rewindClips } from '../agent/rewindClips';
import { smoothSlowClips } from '../agent/smoothSlowClips';
import { clearCaptionsOfPeople } from './clearOfPeople';
import { findPeople } from '../peopleFinder';
import { DIRECTOR_PROP, type SavedDirector } from './directorSession';
import { depthSrcOf, wantsDepth, withDepthMap } from '../depthMaps';

/** RS-1238: every clip with a depth effect gets its photo's depth map (so the review frames and the export show the move). */
export async function attachDepthMaps(actions: AtomicAction[], fps: number, onProgress?: (text: string) => void, fetcher?: Parameters<typeof withDepthMap>[2]): Promise<string[]> {
  const adds = actions.filter((a): a is Extract<AtomicAction, { type: 'add' }> => a.type === 'add' && wantsDepth(a.item) && !depthSrcOf(a.item));
  if (!adds.length) return [];
  onProgress?.('Reading the depth of the photos');
  const missing: string[] = [];
  for (const a of adds) {
    const item = await withDepthMap(a.item, fps, fetcher);
    if (depthSrcOf(item)) a.item = item; else missing.push(a.item.name ?? a.item.id);
  }
  return missing.length
    ? [`${missing.length} photo${missing.length === 1 ? '' : 's'} move${missing.length === 1 ? 's' : ''} without depth (a flat push or pan): the Photo depth model is not installed (Settings → Local models → Photo depth)`]
    : [];
}

/**
 * Markers aimed at the person they name, rewind sections reversed, depth maps attached, captions moved off faces, slow
 * motion smoothed (last: the copies are not pool media, so finding people under a caption reads the clips before it).
 * Returns notes.
 */
export async function finishDirectorActions(actions: AtomicAction[], assets: readonly MediaAsset[], api: Pick<AnalyzeApi, 'reverseClip' | 'smoothSlow'>, fps: number, onProgress?: (text: string) => void): Promise<string[]> {
  const notes: string[] = [];
  if (actions.some((a) => a.type === 'add' && (a.item as { props?: { rsAim?: unknown } }).props?.rsAim)) onProgress?.('Finding who the markers point at');
  notes.push(...await aimMarkers(actions, findPeople));
  notes.push(...await rewindClips(actions, api, fps, onProgress));
  notes.push(...await attachDepthMaps(actions, fps, onProgress));
  const canvas = actions.find((a): a is Extract<AtomicAction, { type: 'setCanvas' }> => a.type === 'setCanvas');
  if (canvas) { onProgress?.('Keeping captions off faces'); await clearCaptionsOfPeople(actions, assets, canvas, fps, findPeople); }
  notes.push(...await smoothSlowClips(actions, api, fps, onProgress));
  return notes;
}

/** Each section's span in seconds on the timeline, from the items it added. */
export function sectionSpans(actions: readonly AtomicAction[], sections: number, fps: number): Array<{ from: number; to: number }> {
  return Array.from({ length: sections }, (_, i) => {
    const mine = actions.filter((a): a is Extract<AtomicAction, { type: 'add' }> => a.type === 'add' && String((a.item.props as { rsSection?: unknown } | undefined)?.rsSection ?? '').startsWith(`${i + 1}-`));
    const from = mine.length ? Math.min(...mine.map((a) => a.startFrame ?? 0)) : 0;
    const to = mine.length ? Math.max(...mine.map((a) => (a.startFrame ?? 0) + a.item.durationInFrames)) : from;
    return { from: from / fps, to: to / fps };
  });
}

/** RS-1222: the run goes with the reel, on its black canvas. */
export function stampDirector(actions: readonly AtomicAction[], saved: SavedDirector): AtomicAction[] {
  return actions.map((a) => (a.type === 'add' && (a.item.props as { rsSection?: unknown } | undefined)?.rsSection === 'canvas'
    ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), [DIRECTOR_PROP]: saved } } } as AtomicAction : a));
}
