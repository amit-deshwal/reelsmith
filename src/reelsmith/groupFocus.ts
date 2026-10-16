// A crop that centres on the one biggest face loses the rest of a group (a selfie with friends behind: the friends' heads
// fall off the top). Where the person mask shows people besides that face, the focus becomes the faces and upper bodies
// of everyone: the person region from its top down to `UPPER` of its height, joined with the main face.
import type { GeomRect } from '../geometry/geometry-math';

/** How much of the people region counts, from its top: heads and shoulders matter more than legs. */
const UPPER = 0.65;
/** Ignore masks that cover almost nothing (noise). */
const MIN_COVERAGE = 0.03;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function groupFocusRect(face: GeomRect | null, occ: ArrayLike<number>, gridW: number, gridH: number): GeomRect | null {
  let minX = gridW; let minY = gridH; let maxX = -1; let maxY = -1; let count = 0;
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (!occ[y * gridW + x]) continue;
      count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (count < gridW * gridH * MIN_COVERAGE || maxX < 0) return face;
  const x0 = minX / gridW; const y0 = minY / gridH;
  const x1 = (maxX + 1) / gridW; const y1 = (maxY + 1) / gridH;
  const upper = { x0, y0, x1, y1: y0 + (y1 - y0) * UPPER };
  if (face) {
    upper.x0 = Math.min(upper.x0, face.x); upper.y0 = Math.min(upper.y0, face.y);
    upper.x1 = Math.max(upper.x1, face.x + face.w); upper.y1 = Math.max(upper.y1, face.y + face.h);
  }
  const rect = { x: clamp01(upper.x0), y: clamp01(upper.y0), w: 0, h: 0 };
  rect.w = clamp01(upper.x1) - rect.x; rect.h = clamp01(upper.y1) - rect.y;
  return rect.w > 0 && rect.h > 0 ? rect : face;
}
