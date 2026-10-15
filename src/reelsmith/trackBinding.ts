// Assemblers name lanes symbolically (V1 = main picture lane, V2/V3 = overlays, G1.. = collage tiles, T1 = titles, A1 = music).
// Before dispatch, bind them to the timeline's real tracks: reuse a matching lane when there is one, otherwise create it.
// Without this, an unknown lane id is treated by the editor as a brand-new ghost track.
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import type { TimelineState, TrackId, TrackKind } from '../editor/types';
import { resolveTrackId, timelineTrackIds, trackKind } from '../editor/types';

const GROUP_RANK: Record<string, number> = { V: 0, G: 1, T: 2, A: 3 };

function symbolicKind(name: string): TrackKind {
  return name.toUpperCase().startsWith('A') ? 'audio' : 'video';
}

/** Bottom-to-top creation order so each new video lane stacks above the previous one. */
function laneOrder(a: string, b: string): number {
  const ra = GROUP_RANK[a[0]!.toUpperCase()] ?? 9;
  const rb = GROUP_RANK[b[0]!.toUpperCase()] ?? 9;
  return ra - rb || Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b);
}

export function bindTracks(action: BatchAction, tl: TimelineState, newId: () => TrackId = () => `track_${crypto.randomUUID()}`): BatchAction {
  const names = new Set<string>();
  for (const a of action.actions) if (a.type === 'add') names.add(a.item.track);
  const known = new Set(timelineTrackIds(tl));
  const map = new Map<string, TrackId>();
  const creates: AtomicAction[] = [];
  for (const name of [...names].sort(laneOrder)) {
    const kind = symbolicKind(name);
    const existing = resolveTrackId(tl, name, kind);
    if (existing && trackKind(tl, existing) === kind) { map.set(name, existing); continue; }
    if (known.has(name)) { map.set(name, name); continue; }
    const id = newId();
    map.set(name, id);
    creates.push({ type: 'track.create', track: { id, kind } });
  }
  const actions = action.actions.map((a): AtomicAction =>
    a.type === 'add' ? { ...a, item: { ...a.item, track: map.get(a.item.track) ?? a.item.track } } : a);
  // creates go right after a leading clear/setCanvas so they are part of the same undo step
  const lead = actions.findIndex((a) => a.type !== 'clear' && a.type !== 'setCanvas');
  const at = lead < 0 ? actions.length : lead;
  return { ...action, actions: [...actions.slice(0, at), ...creates, ...actions.slice(at)] };
}
