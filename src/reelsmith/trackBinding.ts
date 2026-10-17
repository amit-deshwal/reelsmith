// Assemblers name lanes symbolically (V1 = main picture lane, V2/V3 = overlays, G1.. = collage tiles, T1 = titles, A1 = music).
// Before dispatch, bind them to the timeline's real tracks: reuse a matching lane when there is one, otherwise create it.
// Without this, an unknown lane id is treated by the editor as a brand-new ghost track.
// Each placed clip also gets its asset's sourceRevision, as the editor's own add paths do: the project migration
// fills it in on save otherwise, so the saved document never matched the live one and every agent call after
// Assemble was refused as stale until the tab was reloaded.
import type { AtomicAction, BatchAction } from '../editor/reducerActions';
import { sourceRevisionOf } from '../editor/mediaSourceRevision';
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
  // caption settings with no track (Captioned Story) need a caption track to live on; without one the
  // captions are stored nowhere the Captions panel or preview can see. Reuse the timeline's caption track if it has one.
  let captionTrack: TrackId | undefined;
  if (action.actions.some((a) => a.type === 'setCaptions' && !a.track)) {
    captionTrack = timelineTrackIds(tl).find((id) => trackKind(tl, id) === 'caption') ?? newId();
    if (!known.has(captionTrack) && !creates.some((c) => c.type === 'track.create' && c.track.id === captionTrack)) {
      creates.push({ type: 'track.create', track: { id: captionTrack, kind: 'caption', name: 'Captions' } });
    }
  }
  const revisionBySrc = new Map((tl.assets ?? []).map((asset) => [asset.src, sourceRevisionOf(asset)]));
  const actions = action.actions.map((a): AtomicAction => {
    if (a.type === 'setCaptions' && !a.track && captionTrack) return { ...a, track: captionTrack };
    if (a.type !== 'add') return a;
    const rev = !a.item.sourceRevision && a.item.src ? revisionBySrc.get(a.item.src) : undefined;
    return { ...a, item: { ...a.item, track: map.get(a.item.track) ?? a.item.track, ...(rev ? { sourceRevision: rev } : {}) } };
  });
  // creates go right after a leading clear/setCanvas so they are part of the same undo step
  const lead = actions.findIndex((a) => a.type !== 'clear' && a.type !== 'setCanvas');
  const at = lead < 0 ? actions.length : lead;
  return { ...action, actions: [...actions.slice(0, at), ...creates, ...actions.slice(at)] };
}
