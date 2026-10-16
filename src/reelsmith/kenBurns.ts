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
 * How much a contain-fitted picture must be enlarged to cover the canvas (1 when the shapes match or a size is unknown).
 * Ken Burns zooms are relative to the contain fit, so without this a photo of another shape shows bands at the start.
 */
export function coverScale(src?: { width?: number; height?: number }, canvas?: { width: number; height: number }): number {
  if (!(src?.width && src.height && canvas && canvas.width > 0 && canvas.height > 0)) return 1;
  const ratio = (src.width / src.height) / (canvas.width / canvas.height);
  return ratio >= 1 ? ratio : 1 / ratio;
}

/** Replace the clip's reframe curve with the preset's two keyframes. Pure. */
export function kenBurnsActions(
  item: Pick<TimelineItem, 'id' | 'zoom' | 'durationInFrames'>, preset: KenBurnsPreset,
  fit?: { src?: { width?: number; height?: number }; canvas?: { width: number; height: number } },
): AtomicAction[] {
  const { from, to } = KEN_BURNS[preset];
  const cover = coverScale(fit?.src, fit?.canvas);
  const last = Math.max(1, item.durationInFrames - 1);
  const key = (frame: number, p: Pose): AtomicAction => ({ type: 'reframeKeyframe', id: item.id, frame, focalPointX: p.x, focalPointY: p.y, magnification: p.m * cover });
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
