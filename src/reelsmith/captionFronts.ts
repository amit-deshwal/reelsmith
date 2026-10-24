// Captions behind the speaker (RS-502): while a caption with rsBehind shows, each clip under it is painted again above the
// captions with the person cut-out last, so only the person covers the words, in the same colours. Derived at render
// time, so it follows every later edit of the clips and the words, and the style stays one undoable caption change.
import { buildCaptionPages } from '../captions/captionPages';
import type { CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';
import { FRONT_CUTOUT } from './director/frontCutout';

/** Cut-out copies of the picture clips in `ordered` (paint order) that play while a behind-the-speaker caption shows. */
export function captionFrontItems(ordered: readonly TimelineItem[], captions: ReadonlyArray<CaptionsData | null | undefined>, items: TimelineItem[], fps: number): TimelineItem[] {
  const windows = captions.filter((c): c is CaptionsData => !!c?.enabled && c.rsBehind === true)
    .flatMap((c) => buildCaptionPages(c, items, fps).map(({ page }) => [Math.floor((page.start / 1000) * fps), Math.ceil((page.end / 1000) * fps)] as const));
  if (!windows.length) return [];
  return ordered.filter((item) => (item.kind === 'video' || item.kind === 'image')
    && !(item.effects ?? []).some((e) => e.assetId === FRONT_CUTOUT)
    && windows.some(([from, to]) => item.startFrame < to && from < item.startFrame + item.durationInFrames))
    .map((item) => ({
      ...item, id: `${item.id}::caption-front`, volume: 0,
      effects: [...(item.effects ?? []), { id: `${item.id}-caption-cut`, assetId: FRONT_CUTOUT, overrides: { white: 0 } }],
    }));
}
