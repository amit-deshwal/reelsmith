// Collage grid slot layouts (split2v, grid2x2, split3v, grid3x3 ...) shared by the director's grid moves.
import type { SlotRect } from '../../editor/layouts';

const rows = (n: number): SlotRect[] => Array.from({ length: n }, (_, i) => ({ x: 0, y: i / n, w: 1, h: 1 / n }));
const grid = (n: number): SlotRect[] =>
  Array.from({ length: n * n }, (_, i) => ({ x: (i % n) / n, y: Math.floor(i / n) / n, w: 1 / n, h: 1 / n }));

export const LAYOUT_SLOTS: Record<string, SlotRect[]> = {
  split2v: rows(2), split2h: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  split3v: rows(3), grid2x2: grid(2), grid3x3: grid(3),
};

/** Shrink a slot by a gutter (px) on every inner edge, keeping the outer margin equal to half a gutter. */
export function withGutter(slot: SlotRect, gutterPx: number, canvas: { width: number; height: number }): SlotRect {
  const gx = gutterPx / 2 / canvas.width;
  const gy = gutterPx / 2 / canvas.height;
  return { x: slot.x + gx, y: slot.y + gy, w: Math.max(0.01, slot.w - 2 * gx), h: Math.max(0.01, slot.h - 2 * gy) };
}
