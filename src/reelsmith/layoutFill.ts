// RS-406: drag-to-fill layout cells. A chosen layout draws its cells over the preview; dropping a media asset on a
// cell adds the clip at the playhead and fits it into that cell (cover). Pure helpers; the UI is in ui/LayoutFillOverlay.tsx.
import { placeInSlot, type SlotRect } from '../editor/layouts';
import type { EditorCommands } from '../editor/storeCommands';
import { timelineTrackIds, trackKind } from '../editor/timelineTypes';
import type { TimelineState, TrackId } from '../editor/types';
import { LAYOUT_SLOTS } from './assembler/collageGrid';

export type FillLayoutId = 'split2v' | 'split2h' | 'split3v' | 'grid2x2' | 'grid3x3';

export const FILL_LAYOUTS: { id: FillLayoutId; label: string }[] = [
  { id: 'split2v', label: '2 stacked' },
  { id: 'split2h', label: '2 side by side' },
  { id: 'split3v', label: '3 stacked' },
  { id: 'grid2x2', label: '2 × 2 grid' },
  { id: 'grid3x3', label: '3 × 3 grid' },
];

export const fillSlots = (id: FillLayoutId): SlotRect[] => LAYOUT_SLOTS[id]!;

/** Index of the cell under a canvas-fraction point (0..1), or -1 when outside every cell. */
export function cellAt(id: FillLayoutId, fx: number, fy: number): number {
  return fillSlots(id).findIndex((s) => fx >= s.x && fx < s.x + s.w && fy >= s.y && fy < s.y + s.h);
}

/** First video track with nothing in [start, end), or null when every video track is busy there. Pure. */
export function freeVideoTrack(state: Pick<TimelineState, 'items' | 'tracks' | 'trackOrder'>, start: number, end: number): TrackId | null {
  for (const id of timelineTrackIds(state as TimelineState).slice().reverse()) {
    if (trackKind(state as TimelineState, id) !== 'video') continue;
    const busy = state.items.some((it) => it.track === id && it.startFrame < end && it.startFrame + it.durationInFrames > start);
    if (!busy) return id;
  }
  return null;
}

/**
 * Add the asset at `frame` on a track that is free there and fit it into the cell: one undo step. A new track is
 * created when every video track is busy; the editor's command layer only sees it after the next render, so the
 * clip is added once a tick has passed. Null for an unknown asset.
 */
export async function dropAssetInCell(
  commands: Pick<EditorCommands, 'addMediaItem' | 'setItemTransform' | 'createTrack' | 'beginHistoryGesture' | 'endHistoryGesture'>,
  state: Pick<TimelineState, 'assets' | 'items' | 'tracks' | 'trackOrder'>, frame: number, assetId: string, slot: SlotRect,
): Promise<string | null> {
  const asset = state.assets?.find((a) => a.id === assetId);
  if (!asset) return null;
  commands.beginHistoryGesture();
  try {
    let track = freeVideoTrack(state, frame, frame + asset.durationInFrames);
    if (!track) {
      track = commands.createTrack('video');
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const id = commands.addMediaItem(asset, { track, startFrame: frame });
    commands.setItemTransform(id, placeInSlot(slot, 'cover'));
    return id;
  } finally {
    commands.endHistoryGesture();
  }
}
