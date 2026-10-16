// Ken Burns presets for photos: a slow push, pull or pan written as two reframe keyframes (first and last frame),
// so one undo reverts it and re-applying replaces the old motion. Works on any visual clip, photos in practice.
import type { AtomicAction } from '../editor/reducerActions';
import type { TimelineItem } from '../editor/types';

export type KenBurnsPreset = 'push-in' | 'pull-out' | 'pan-right' | 'pan-left' | 'drift-up' | 'drift-down';

interface Pose { x: number; y: number; m: number }
interface Motion { label: string; from: Pose; to: Pose }

// Origin (x, y) is where the zoom is anchored; moving it while zoomed pans the picture. Pans stay at 1.25x so the
// picture always covers the canvas and the move is visible.
export const KEN_BURNS: Record<KenBurnsPreset, Motion> = {
  'push-in': { label: 'Slow push in', from: { x: 0.5, y: 0.5, m: 1 }, to: { x: 0.5, y: 0.5, m: 1.2 } },
  'pull-out': { label: 'Slow pull out', from: { x: 0.5, y: 0.5, m: 1.2 }, to: { x: 0.5, y: 0.5, m: 1 } },
  'pan-right': { label: 'Pan left to right', from: { x: 0.15, y: 0.5, m: 1.25 }, to: { x: 0.85, y: 0.5, m: 1.25 } },
  'pan-left': { label: 'Pan right to left', from: { x: 0.85, y: 0.5, m: 1.25 }, to: { x: 0.15, y: 0.5, m: 1.25 } },
  'drift-up': { label: 'Drift up', from: { x: 0.5, y: 0.85, m: 1.25 }, to: { x: 0.5, y: 0.15, m: 1.25 } },
  'drift-down': { label: 'Drift down', from: { x: 0.5, y: 0.15, m: 1.25 }, to: { x: 0.5, y: 0.85, m: 1.25 } },
};

export const KEN_BURNS_ORDER = Object.keys(KEN_BURNS) as KenBurnsPreset[];

/** Photos are the target, but a still-like gif or svg is fine too; video already has Reframe. */
export const canKenBurns = (item: Pick<TimelineItem, 'kind'>): boolean => item.kind === 'image' || item.kind === 'gif' || item.kind === 'svg';

/**
 * The part of the canvas a contain-fitted picture covers along the axis where its shape differs, after any fill
 * transform the clip already has (1 = no bands). Ken Burns zooms about a point of the canvas, so with bands
 * the zoom must be big enough, and anchored inside the picture, to keep them out of frame.
 */
export function pictureExtent(
  src?: { width?: number; height?: number; transform?: { scale?: number } },
  canvas?: { width: number; height: number },
): { axis: 'x' | 'y'; extent: number } | null {
  if (!(src?.width && src.height && canvas && canvas.width > 0 && canvas.height > 0)) return null;
  const ratio = (src.width / src.height) / (canvas.width / canvas.height);
  const existing = typeof src.transform?.scale === 'number' && src.transform.scale > 0 ? src.transform.scale : 1;
  const extent = Math.min(1, existing * (ratio >= 1 ? 1 / ratio : ratio));
  return extent < 1 - 1e-6 ? { axis: ratio >= 1 ? 'y' : 'x', extent } : null;
}

/** Pose adjusted so the picture still covers the canvas: anchor mapped into the picture, zoom at least what that anchor needs. */
export function coverPose(p: Pose, fit: { axis: 'x' | 'y'; extent: number } | null): Pose {
  if (!fit) return p;
  const { extent: s } = fit;
  const f = Math.min(0.95, Math.max(0.05, fit.axis === 'x' ? p.x : p.y));
  const top = (1 - s) / 2;
  const anchor = top + f * s;
  const need = Math.max(anchor / (f * s), (1 - anchor) / ((1 - f) * s));
  const m = Math.max(p.m / s, need);
  return fit.axis === 'x' ? { x: anchor, y: p.y, m } : { x: p.x, y: anchor, m };
}

/** Replace the clip's reframe curve with the preset's two keyframes. Pure. */
export function kenBurnsActions(
  item: Pick<TimelineItem, 'id' | 'zoom' | 'durationInFrames'>, preset: KenBurnsPreset,
  fit?: { src?: { width?: number; height?: number; transform?: { scale?: number } }; canvas?: { width: number; height: number } },
): AtomicAction[] {
  const motion = KEN_BURNS[preset];
  const extent = pictureExtent(fit?.src, fit?.canvas);
  const from = coverPose(motion.from, extent);
  const to = coverPose(motion.to, extent);
  const last = Math.max(1, item.durationInFrames - 1);
  const key = (frame: number, p: Pose): AtomicAction => ({ type: 'reframeKeyframe', id: item.id, frame, focalPointX: p.x, focalPointY: p.y, magnification: p.m });
  return [
    ...(item.zoom?.reframeCurve?.keyframes ?? []).map((k) => ({ type: 'removeReframeKeyframe' as const, id: item.id, frame: k.frame })),
    key(0, from),
    key(last, to),
  ];
}

/** Remove the motion again. */
export function clearKenBurnsActions(item: Pick<TimelineItem, 'id' | 'zoom'>): AtomicAction[] {
  return (item.zoom?.reframeCurve?.keyframes ?? []).map((k) => ({ type: 'removeReframeKeyframe' as const, id: item.id, frame: k.frame }));
}
