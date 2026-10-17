// Picture quality lint: how many times a shot's source pixels are blown up on the canvas. The renderer contain-fits the
// source, then applies the clip's scale and its reframe zoom, so output pixels per source pixel is the product of the three.
import type { TimelineItem, TimelineState } from '../editor/types';
import type { LintIssue } from './reelLint';

/** Up to here a blow-up looks acceptable on a phone; past SOFT it reads soft, past BLOCKY it shows pixels. */
export const UPSCALE_SOFT = 2;
export const UPSCALE_BLOCKY = 3;

const VISUAL = new Set(['video', 'image']);

/** Output pixels per source pixel for the sharpest point of the clip's zoom (null when the source size is unknown). */
export function upscaleFactor(item: Pick<TimelineItem, 'width' | 'height' | 'transform' | 'zoom'>, canvas: { width: number; height: number }): number | null {
  if (!(item.width && item.height && canvas.width > 0 && canvas.height > 0)) return null;
  const fit = Math.min(canvas.width / item.width, canvas.height / item.height);
  const t = item.transform;
  const base = t?.scale ?? 1;
  const scale = Math.max(Math.abs(t?.scaleX ?? base), Math.abs(t?.scaleY ?? base)); // negative = mirrored
  const keys = item.zoom?.reframeCurve?.keyframes ?? [];
  const mag = keys.length ? Math.max(...keys.map((k) => k.magnification)) : 1;
  return fit * scale * Math.max(1, mag);
}

export function lintPictureQuality(state: TimelineState): LintIssue[] {
  const canvas = { width: state.width, height: state.height };
  const issues: LintIssue[] = [];
  for (const item of state.items) {
    if (!VISUAL.has(item.kind)) continue;
    const up = upscaleFactor(item, canvas);
    if (up === null || up <= UPSCALE_SOFT) continue;
    const blocky = up > UPSCALE_BLOCKY;
    issues.push({
      level: 'warning', frame: item.startFrame, itemId: item.id,
      message: `"${item.name}" is enlarged ${up.toFixed(1)}x (${item.width}x${item.height} source on a ${canvas.width}x${canvas.height} canvas): ${blocky ? 'it will look blocky' : 'it will look soft'}. Use a bigger source, zoom less, or pick another shot.`,
    });
  }
  return issues;
}
