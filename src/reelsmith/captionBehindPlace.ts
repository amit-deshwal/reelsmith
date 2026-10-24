// Where "Behind the speaker" captions go: across the head of the main person in the clips under them. A fixed height
// missed in real footage (a selfie framed low had the words in the sky above him, so nothing covered them). The words
// are centred just above the brow: the hair covers the middle of the letters and the face stays clear (on that selfie,
// across the eyes hid the face and higher up nothing covered the words).
import { buildCaptionPages } from '../captions/captionPages';
import type { CaptionLayout, CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';
import { headOf, type PeopleFinder } from './director/aimMarkers';
import { FRONT_CUTOUT } from './director/frontCutout';
import { focusBand } from './titleClear';

/** Where the words sit on the head box: 0 its top (the brow for a found face), 1 the chin; negative is above. */
const ACROSS_HEAD = -0.1;
/** The block stays inside these heights (fractions of the frame), clear of the top bar and Instagram's bottom band. */
const TOP = 0.14, BOTTOM = 0.72;
const SAMPLES = 3;

/** Canvas proportions from a ratio id like "9:16". */
export function canvasOfRatio(ratio: string | undefined): { width: number; height: number } {
  const [w, h] = (ratio ?? '9:16').split(':').map(Number);
  return w && h ? { width: w, height: h } : { width: 9, height: 16 };
}

/** A few moments where the captions show: the start of the first, middle and last caption pages. */
export function sampleFrames(captions: CaptionsData, items: TimelineItem[], fps: number): number[] {
  const pages = buildCaptionPages(captions, items, fps).map(({ page }) => page).sort((a, b) => a.start - b.start);
  if (!pages.length) return [];
  const picks = [...new Set([0, Math.floor((pages.length - 1) / 2), pages.length - 1])].slice(0, SAMPLES);
  return picks.map((i) => Math.round(((pages[i]!.start + Math.min(300, (pages[i]!.end - pages[i]!.start) / 2)) / 1000) * fps));
}

export async function behindCaptionLayout(items: TimelineItem[], captions: CaptionsData, canvas: { width: number; height: number }, fps: number, find: PeopleFinder): Promise<CaptionLayout | null> {
  const centres: number[] = [];
  for (const f of sampleFrames(captions, items, fps)) {
    const item = items.find((i) => (i.kind === 'video' || i.kind === 'image') && !!i.src && !!i.width && !!i.height
      && i.startFrame <= f && f < i.startFrame + i.durationInFrames && !(i.effects ?? []).some((e) => e.assetId === FRONT_CUTOUT));
    if (!item) continue;
    const shot = { src: item.src!, kind: item.kind === 'image' ? 'image' as const : 'video' as const, width: item.width!, height: item.height!,
      sec: item.kind === 'image' ? 0 : ((item.srcInFrame ?? 0) + (f - item.startFrame) * (item.playbackRate ?? 1)) / fps };
    const people = await find(shot).catch(() => []);
    const main = [...people].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!main) continue;
    const band = focusBand(item, canvas, headOf(main, shot));
    if (band) centres.push(band[0] + (band[1] - band[0]) * ACROSS_HEAD);
  }
  if (!centres.length) return null;
  const middle = [...centres].sort((a, b) => a - b)[Math.floor(centres.length / 2)]!;
  return { anchor: 'middle-center', offsetYRatio: Math.round((Math.min(BOTTOM, Math.max(TOP, middle)) - 0.5) * 1000) / 1000 };
}
