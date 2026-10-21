// Keeps captions off everyone's head, after the build. withTitleClear (titleClear.ts) moves a line off the one face the
// clip analysis found, so in a selfie with a friend behind it "bro said it's a simple trek" sat on bro (his face covered,
// never found). Here every person in the shot under a line is found (peopleFinder.ts) and the line moves to the nearest
// height clear of all their heads, inside the safe area; when no such height exists it stays where it was.
import type { AtomicAction } from '../../editor/reducerActions';
import { safeRect, textBox } from '../safeZone';
import { focusBand } from '../titleClear';
import { headOf, type PeopleFinder } from './aimMarkers';
import type { AimShot } from './graphics';

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

/** Moves (in place) each caption that covers a person's head. Returns how many moved. */
export async function clearCaptionsOfPeople(actions: AtomicAction[], assets: readonly ShotAsset[], canvas: Canvas, fps: number, find: PeopleFinder): Promise<number> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const visuals = actions.filter((a): a is Add => a.type === 'add' && (a.item.kind === 'video' || a.item.kind === 'image'));
  const safe = safeRect(canvas);
  const safeTop = safe.y / canvas.height, safeBottom = (safe.y + safe.h) / canvas.height;
  const seen = new Map<string, ReturnType<PeopleFinder>>();
  let moved = 0;
  for (const action of actions) {
    if (action.type !== 'add' || action.item.kind !== 'text') continue;
    const text = action.item;
    const props = text.props as { rsBehind?: unknown; rsFixedPosition?: unknown } | undefined;
    if (props?.rsBehind || props?.rsFixedPosition) continue;
    const start = action.startFrame ?? 0, end = start + text.durationInFrames;
    const under = visuals
      .map((v) => ({ v, from: Math.max(start, v.startFrame ?? 0), to: Math.min(end, (v.startFrame ?? 0) + v.item.durationInFrames) }))
      .filter((x) => x.to > x.from)
      .sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    const asset = under && byId.get(String(under.v.item.sourceAssetId ?? ''));
    if (!under || !asset?.width || !asset.height || !asset.src) continue;
    const mid = Math.round((under.from + under.to) / 2) - (under.v.startFrame ?? 0);
    const src = (under.v.item.srcInFrame ?? 0) + mid * (under.v.item.playbackRate ?? 1);
    const shot: AimShot = { src: asset.src, kind: asset.kind === 'image' ? 'image' : 'video', sec: asset.kind === 'image' ? 0 : src / fps, width: asset.width, height: asset.height };
    const key = `${shot.src}@${shot.sec.toFixed(1)}`;
    if (!seen.has(key)) seen.set(key, find(shot).catch(() => []));
    const people = await seen.get(key)!;
    const box = textBox(text, canvas);
    const [tx0, tx1] = [box.x / canvas.width, (box.x + box.w) / canvas.width];
    // the heads the line could cover: those under it side to side, as vertical bands of the canvas
    const bands = people.flatMap((p) => {
      const head = headOf(p, shot);
      const x = spanX(under.v.item, canvas, head);
      const band = focusBand(under.v.item as never, canvas, head);
      return band && x && x[1] > tx0 && x[0] < tx1 ? [[band[0] - MARGIN, band[1] + MARGIN] as const] : [];
    });
    const centre = (box.y + box.h / 2) / canvas.height, half = box.h / 2 / canvas.height;
    const clear = (c: number) => bands.every(([a, b]) => c + half <= a || c - half >= b);
    if (!bands.length || clear(centre)) continue;
    const best = bands.flatMap(([a, b]) => [a - half, b + half])
      .filter((c) => c - half >= safeTop && c + half <= safeBottom && clear(c))
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))[0];
    if (best === undefined) continue;
    action.item = { ...text, transform: { ...(text.transform as object | undefined), y: (best - 0.5) * 100 } } as typeof text;
    moved += 1;
  }
  return moved;
}
