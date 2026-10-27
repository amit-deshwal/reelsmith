// Marks on the items of an on-screen line: behind the person, its key and words (for reels_restyle_text), and a thin
// outline where the line sits over a white flash. Split out of assembleDirector.ts.
import type { AtomicAction } from '../../editor/reducerActions';

/** A line meant to pass behind the person: withTitleClear lays it across them instead of moving it off their face. */
export const markBehind = (a: AtomicAction): AtomicAction => (a.type === 'add' && (a.item.kind === 'text' || a.item.kind === 'motion-graphic')
  ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), rsBehind: true } } } as AtomicAction : a);
/** Every item of one on-screen line carries the line's key and words, so reels_restyle_text can find all of it later. */
export const tagLine = (a: AtomicAction, line: string, text: string, style: string): AtomicAction => (a.type === 'add' && (a.item.kind === 'text' || a.item.kind === 'motion-graphic')
  ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), rsLine: line, rsLineText: text, rsTextStyle: style } } } as AtomicAction : a);

/**
 * A section whose move flashes white under its line (flash cuts, break-in bars) gives the line a thin dark outline: white
 * letters on a 0.85 white flash vanished even with their soft halo ("Alang Madan Kulang", 2026-10-28). Only engine
 * lines without an outline of their own; the outline is about 2.5% of the letter size.
 */
export const FLASHING_MOVES = new Set(['flash-cuts', 'break-in']);
export const outlineOnFlash = (a: AtomicAction): AtomicAction => {
  if (a.type !== 'add' || a.item.kind !== 'motion-graphic') return a;
  const p = (a.item.props ?? {}) as { preset?: unknown; fontSize?: unknown; stroke?: unknown; color?: unknown };
  if (typeof p.preset !== 'string' || p.stroke || typeof p.fontSize !== 'number') return a;
  return { ...a, item: { ...a.item, props: { ...p, stroke: { width: Math.max(2, Math.round(p.fontSize * 0.025)), color: 'rgba(0,0,0,0.85)' } } } } as AtomicAction;
};
