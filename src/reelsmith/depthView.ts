// RS-1238: where a depth-effect clip sits on the canvas. Photos are placed in a contain box and then scaled up by their
// fill transform (x2.4 for a landscape photo in 9:16), so the effect must draw at the scaled size or the move is soft, and
// the camera move should centre on the part that is on screen, using the picture beyond the frame's edges as its margin.
import type { TimelineItem } from '../editor/types';
import { resolveClipScaleAxes } from '../editor/clipTransformScale';

/** Largest side of the effect's drawing (the GPU and memory budget of one clip). */
const MAX_SIDE = 4096;

/** How much larger than its box the effect draws: the clip's own scale-up, at most 3x and MAX_SIDE. */
export function depthDetail(item: Pick<TimelineItem, 'transform'>, boxW: number, boxH: number): number {
  const { scaleX, scaleY } = resolveClipScaleAxes(item.transform);
  const want = Math.min(3, Math.max(1, Math.abs(scaleX), Math.abs(scaleY)));
  return Math.max(1, Math.min(want, MAX_SIDE / Math.max(1, boxW, boxH)));
}

/**
 * The canvas as seen in the box's texture coordinates, [x0, y0, x1, y1] with y running upwards (as the shaders sample),
 * clipped to the picture. The box is centred on the canvas and moved by the clip's transform (translate in % of the box,
 * scale about its centre, as clipFade.ts writes the CSS); rotation is ignored.
 */
export function visibleWindow(item: Pick<TimelineItem, 'transform'>, boxW: number, boxH: number, canvasW: number, canvasH: number): [number, number, number, number] {
  const { scaleX, scaleY } = resolveClipScaleAxes(item.transform);
  const sx = Math.max(1e-3, Math.abs(scaleX)), sy = Math.max(1e-3, Math.abs(scaleY));
  const tx = ((item.transform?.x ?? 0) / 100) * boxW, ty = ((item.transform?.y ?? 0) / 100) * boxH;
  // canvas point p is box point 0.5 + (p - centre - t) / (box * s)
  const u = (p: number) => 0.5 + (p - canvasW / 2 - tx) / (boxW * sx);
  const v = (p: number) => 0.5 + (p - canvasH / 2 - ty) / (boxH * sy);
  const c = (n: number) => Math.min(1, Math.max(0, n));
  return [c(u(0)), c(1 - v(canvasH)), c(u(canvasW)), c(1 - v(0))];
}
