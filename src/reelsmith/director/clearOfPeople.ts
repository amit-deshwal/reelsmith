// Keeps captions off everyone's head, after the build. withTitleClear (titleClear.ts) moves a line off the one face the
// clip analysis found, so in a selfie with a friend behind it "bro said it's a simple trek" sat on bro (his face covered,
// never found). Here every person in the shot under a line is found (peopleFinder.ts) and the line moves to the nearest
// height clear of all their heads, inside the safe area; when no such height exists it stays where it was and the build
// says so. Lines drawn by the text engine (rise-lines, typewriter, shine, slam...: most of the director's styles) are
// motion graphics, not text items: they were skipped here, and "a line on someone's head" was the most common defect
// the critic named (25 of 89 over 24 runs to 2026-11-07). They are moved the same way, by their `y`.
import type { AtomicAction } from '../../editor/reducerActions';
import { safeRect, textBox } from '../safeZone';
import { focusBand } from '../titleClear';
import { headOf, type PeopleFinder } from './aimMarkers';
import type { AimShot } from './graphics';
import { TEXT_GRAPHIC_CODE } from './textGraphic';

type Canvas = { width: number; height: number };
type Add = Extract<AtomicAction, { type: 'add' }>;
export type ShotAsset = { id: string; src: string; kind: string; width?: number; height?: number };

const MARGIN = 0.02;

/** Where a picture rect lands horizontally on the canvas (the x of focusBand). */
function spanX(item: Add['item'], canvas: Canvas, r: { x: number; w: number }): [number, number] | null {
  const { width: w, height: h } = item as { width?: number; height?: number };
  if (!(w && h)) return null;
  const t = (item as { transform?: { scale?: number; scaleX?: number; x?: number } }).transform;
  const drawn = Math.min(canvas.width / w, canvas.height / h) * w * Math.abs(t?.scaleX ?? t?.scale ?? 1);
  const left = canvas.width / 2 + ((t?.x ?? 0) / 100) * canvas.width - drawn / 2;
  return [(left + r.x * drawn) / canvas.width, (left + (r.x + r.w) * drawn) / canvas.width];
}

/** Shots under one line that are looked at (the longest ones): a line over a run of cuts sits on several. */
const SHOTS_PER_LINE = 3;

interface LineBox { x0: number; x1: number; centre: number; half: number; label: string; move: (centre: number) => Add['item'] }

/** Where a line sits on the canvas (fractions), and how to move it; null for anything that is not a movable line. */
function lineBox(item: Add['item'], canvas: Canvas): LineBox | null {
  const props = (item.props ?? {}) as Record<string, unknown>;
  if (props.rsBehind || props.rsFixedPosition) return null;
  const label = String(props.text ?? '').replace(/\s+/g, ' ').slice(0, 30);
  if (item.kind === 'text') {
    const box = textBox(item, canvas);
    return {
      x0: box.x / canvas.width, x1: (box.x + box.w) / canvas.width, centre: (box.y + box.h / 2) / canvas.height, half: box.h / 2 / canvas.height, label,
      move: (c) => ({ ...item, transform: { ...(item.transform as object | undefined), y: (c - 0.5) * 100 } }) as Add['item'],
    };
  }
  if (item.kind !== 'motion-graphic' || (item as { code?: unknown }).code !== TEXT_GRAPHIC_CODE) return null;
  // the text engine's block (textGraphic.ts): anchored at x by its alignment, centred on y, line height 1.08
  const size = Number(props.fontSize ?? 96);
  const lines = String(props.text ?? '').split('\n');
  const em = 0.6 * (props.uppercase ? 1.2 : 1) + Number(props.spacing ?? 0);
  const w = Math.min(Number(props.maxWidth ?? 0.86), (Math.max(...lines.map((l) => l.length)) * em * size) / canvas.width);
  const x = Number(props.x ?? 0.5);
  const x0 = props.align === 'left' ? x : props.align === 'right' ? x - w : x - w / 2;
  const h = (lines.length * size * 1.08 + (props.sub ? size * 0.6 : 0)) / canvas.height;
  return { x0, x1: x0 + w, centre: Number(props.y ?? 0.5), half: h / 2, label, move: (c) => ({ ...item, props: { ...props, y: c } }) as Add['item'] };
}

/**
 * Moves (in place) each line that covers a person's head. Returns how many moved, and a note for each line that still
 * covers one because no height inside the safe area is clear of everyone (the agent shortens it or casts another shot).
 */
export async function clearCaptionsOfPeople(actions: AtomicAction[], assets: readonly ShotAsset[], canvas: Canvas, fps: number, find: PeopleFinder): Promise<{ moved: number; stuck: string[] }> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const visuals = actions.filter((a): a is Add => a.type === 'add' && (a.item.kind === 'video' || a.item.kind === 'image'));
  const safe = safeRect(canvas);
  const safeTop = safe.y / canvas.height, safeBottom = (safe.y + safe.h) / canvas.height;
  const seen = new Map<string, ReturnType<PeopleFinder>>();
  let moved = 0;
  const stuck: string[] = [];
  for (const action of actions) {
    if (action.type !== 'add') continue;
    const box = lineBox(action.item, canvas);
    if (!box) continue;
    const start = action.startFrame ?? 0, end = start + action.item.durationInFrames;
    const unders = visuals
      .map((v) => ({ v, from: Math.max(start, v.startFrame ?? 0), to: Math.min(end, (v.startFrame ?? 0) + v.item.durationInFrames) }))
      .filter((x) => x.to > x.from)
      .sort((a, b) => (b.to - b.from) - (a.to - a.from))
      .slice(0, SHOTS_PER_LINE);
    // the heads the line could cover in every shot it sits on: those under it side to side, as vertical bands of the canvas
    const bands: Array<readonly [number, number]> = [];
    for (const under of unders) {
      const asset = byId.get(String(under.v.item.sourceAssetId ?? ''));
      if (!asset?.width || !asset.height || !asset.src) continue;
      const mid = Math.round((under.from + under.to) / 2) - (under.v.startFrame ?? 0);
      const src = (under.v.item.srcInFrame ?? 0) + mid * (under.v.item.playbackRate ?? 1);
      const shot: AimShot = { src: asset.src, kind: asset.kind === 'image' ? 'image' : 'video', sec: asset.kind === 'image' ? 0 : src / fps, width: asset.width, height: asset.height };
      const key = `${shot.src}@${shot.sec.toFixed(1)}`;
      if (!seen.has(key)) seen.set(key, find(shot).catch(() => []));
      for (const p of await seen.get(key)!) {
        const head = headOf(p, shot);
        const x = spanX(under.v.item, canvas, head);
        const band = focusBand(under.v.item as never, canvas, head);
        if (band && x && x[1] > box.x0 && x[0] < box.x1) bands.push([band[0] - MARGIN, band[1] + MARGIN]);
      }
    }
    const { centre, half } = box;
    const clear = (c: number) => bands.every(([a, b]) => c + half <= a || c - half >= b);
    if (!bands.length || clear(centre)) continue;
    const best = bands.flatMap(([a, b]) => [a - half, b + half])
      .filter((c) => c - half >= safeTop && c + half <= safeBottom && clear(c))
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))[0];
    if (best === undefined) {
      stuck.push(`the line "${box.label}" at ${(start / fps).toFixed(1)} s covers a head and no height in the safe area is clear of everyone: shorten it or make it smaller (size), or put it on a shot with room above or below the people`);
      continue;
    }
    action.item = box.move(best);
    moved += 1;
  }
  return { moved, stuck: stuck.slice(0, 4) };
}
