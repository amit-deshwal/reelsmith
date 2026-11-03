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
import { depthSrcOf, depthTrackSrcOf, wantsDepthTrack, wantsStillDepth, withDepthMap } from '../depthMaps';

/** RS-1238: every clip with a depth effect gets its photo's depth map (so the review frames and the export show the move);
 *  RS-1260: a video with lens blur, haze or relight gets its depth track (after slow motion is smoothed: the track follows
 *  the file and span the clip plays); RS-1261: so does a video with a sky effect (the sky of every frame comes with it). */
export async function attachDepthMaps(actions: AtomicAction[], fps: number, onProgress?: (text: string) => void, fetcher?: Parameters<typeof withDepthMap>[2]): Promise<string[]> {
  const needs = (item: Extract<AtomicAction, { type: 'add' }>['item']) => (wantsStillDepth(item) && !depthSrcOf(item)) || (wantsDepthTrack(item) && !depthTrackSrcOf(item));
  const adds = actions.filter((a): a is Extract<AtomicAction, { type: 'add' }> => a.type === 'add' && needs(a.item));
  if (!adds.length) return [];
  onProgress?.(adds.some((a) => wantsDepthTrack(a.item)) ? 'Reading the depth of the shots' : 'Reading the depth of the photos');
  const missing: string[] = [];
  for (const a of adds) {
    const item = await withDepthMap(a.item, fps, fetcher);
    a.item = item;
    if (needs(item)) missing.push(a.item.name ?? a.item.id);
  }
  return missing.length
    ? [`${missing.length} clip${missing.length === 1 ? '' : 's'} with a depth effect ${missing.length === 1 ? 'has' : 'have'} no depth (photo moves stay a flat push or pan, lens blur, haze and relight leave the shot as it is): the Photo depth model is not installed (Settings → Local models → Photo depth)`]
    : [];
}

/**
 * Markers aimed at the person they name, rewind sections reversed, captions moved off faces, slow motion smoothed (the
 * copies are not pool media, so finding people under a caption reads the clips before it), depth maps attached (last: a
 * depth track follows the file a clip plays).
 * Returns notes.
 */
export async function finishDirectorActions(actions: AtomicAction[], assets: readonly MediaAsset[], api: Pick<AnalyzeApi, 'reverseClip' | 'smoothSlow'>, fps: number, onProgress?: (text: string) => void): Promise<string[]> {
  const notes: string[] = [];
  if (actions.some((a) => a.type === 'add' && (a.item as { props?: { rsAim?: unknown } }).props?.rsAim)) onProgress?.('Finding who the markers point at');
  notes.push(...await aimMarkers(actions, findPeople));
  notes.push(...await rewindClips(actions, api, fps, onProgress));
  const canvas = actions.find((a): a is Extract<AtomicAction, { type: 'setCanvas' }> => a.type === 'setCanvas');
  if (canvas) { onProgress?.('Keeping captions off faces'); await clearCaptionsOfPeople(actions, assets, canvas, fps, findPeople); }
  notes.push(...await smoothSlowClips(actions, api, fps, onProgress));
  notes.push(...await attachDepthMaps(actions, fps, onProgress));
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
