// reels_freeze_frame: hold one moment of a video clip as a real still for a while, then play on. The editor has no
// "hold this frame" for video, and a near-zero speed still crawls (it read as slow motion in a real run), so the moment
// becomes an image cut into the clip: same place, framing, effects and track. Cuts after it stay on the beat.
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset, TimelineItem, TimelineState } from '../../editor/types';
import type { AnalyzeApi } from '../runRecipe';

export interface FreezeArgs {
  /** timeline second of the moment to freeze */
  atSec: number;
  /** how long the still holds (seconds) */
  holdSec: number;
  itemId?: string;
  /** after the freeze: play on from the frozen moment (default), or skip the footage the freeze covered */
  resume: 'frozen' | 'skip';
}

export function parseFreezeArgs(raw: Record<string, unknown>): FreezeArgs | { error: string } {
  const atSec = raw.atSec;
  if (typeof atSec !== 'number' || !Number.isFinite(atSec) || atSec < 0) return { error: 'atSec (timeline seconds of the moment to freeze) is required' };
  const holdSec = raw.holdSec ?? 1;
  if (typeof holdSec !== 'number' || !(holdSec >= 0.1 && holdSec <= 10)) return { error: 'holdSec must be 0.1 to 10 seconds' };
  if (raw.resume !== undefined && raw.resume !== 'frozen' && raw.resume !== 'skip') return { error: 'resume must be frozen or skip' };
  return { atSec, holdSec, resume: raw.resume === 'skip' ? 'skip' : 'frozen', ...(typeof raw.itemId === 'string' && raw.itemId ? { itemId: raw.itemId } : {}) };
}

/** Cut-out copies of a person ride on the clip under them (lines behind a person); they are not the clip to freeze. */
const isCutout = (item: TimelineItem) => (item.effects ?? []).some((e) => e.assetId === 'builtin:fx-person-cutout');

/** The video clip showing at the moment: the named one, else the only one there. */
export function freezeTarget(state: TimelineState, a: FreezeArgs): TimelineItem | { error: string } {
  const at = Math.round(a.atSec * state.fps);
  if (a.itemId) {
    const item = state.items.find((i) => i.id === a.itemId || i.id.startsWith(a.itemId!));
    if (!item || item.kind !== 'video') return { error: `no video clip ${a.itemId}` };
    if (at < item.startFrame || at >= item.startFrame + item.durationInFrames) return { error: `${item.id} plays ${(item.startFrame / state.fps).toFixed(2)}-${((item.startFrame + item.durationInFrames) / state.fps).toFixed(2)} s; atSec ${a.atSec} is outside it` };
    return item;
  }
  const here = state.items.filter((i) => i.kind === 'video' && !isCutout(i) && i.startFrame <= at && at < i.startFrame + i.durationInFrames);
  if (!here.length) return { error: `no video clip plays at ${a.atSec} s (photos are already still)` };
  if (here.length > 1) return { error: `${here.length} video clips play at ${a.atSec} s; pass itemId: ${here.map((i) => i.id).join(', ')}` };
  return here[0]!;
}

export interface FreezePlan { actions: AtomicAction[]; stillId: string; atFrame: number; holdFrames: number; sourceSec: number }

/** Where the still comes from: the source second the clip shows at `atFrame`. */
export function sourceSecAt(item: TimelineItem, atFrame: number, fps: number): number {
  return ((item.srcInFrame ?? 0) + (atFrame - item.startFrame) * (item.playbackRate ?? 1)) / fps;
}

/**
 * The edit: split the clip at the moment and where the hold ends, swap the middle for the still (the clip's own fields
 * minus what only a video has), and with resume "frozen" start the rest of the clip at the frozen moment.
 */
export function planFreeze(state: TimelineState, item: TimelineItem, a: FreezeArgs, still: { src: string; width: number; height: number }, newId: () => string): FreezePlan {
  const fps = state.fps;
  const end = item.startFrame + item.durationInFrames;
  const f0 = Math.max(item.startFrame, Math.min(end - 1, Math.round(a.atSec * fps)));
  const f1 = Math.min(end, f0 + Math.max(1, Math.round(a.holdSec * fps)));
  const sourceSec = sourceSecAt(item, f0, fps);
  const assetId = newId();
  const middle = f0 > item.startFrame ? newId() : item.id;
  const rest = f1 < end ? newId() : undefined;
  const stillId = newId();
  const asset: MediaAsset = { id: assetId, kind: 'image', name: `${item.name} (still ${sourceSec.toFixed(2)} s)`, src: still.src, width: still.width, height: still.height, durationInFrames: Math.max(150, f1 - f0) } as MediaAsset;
  const {
    id: _id, startFrame: _s, durationInFrames: _d, srcInFrame: _in, playbackRate: _r, volume: _v, fadeInFrames: _fi, fadeOutFrames: _fo,
    keyframes, zoom: _z, deletedWordIdx: _w, variants: _var, silenceFrames: _sf, cutPadFrames: _cp, gapCapsMs: _gc, sourceRevision: _sr, sourceContentHash: _sh,
    ...look
  } = item as TimelineItem & Record<string, unknown>;
  // keyframes are relative to the item start: keep the part that falls inside the hold, shifted to the still's start
  const shift = f0 - item.startFrame;
  const held = keyframes ? Object.fromEntries(Object.entries(keyframes).map(([prop, list]) => [prop, (list ?? []).filter((k) => k.frame >= shift && k.frame < shift + (f1 - f0)).map((k) => ({ ...k, frame: k.frame - shift }))]).filter(([, list]) => (list as unknown[]).length)) : undefined;
  const stillItem = {
    ...look, id: stillId, kind: 'image' as const, src: still.src, sourceAssetId: assetId, width: still.width, height: still.height,
    durationInFrames: f1 - f0, props: { ...(item.props ?? {}), rsFreeze: Math.round(sourceSec * 1000) / 1000 },
    ...(held && Object.keys(held).length ? { keyframes: held } : {}),
  };
  const actions: AtomicAction[] = [
    { type: 'addAsset', asset },
    ...(middle !== item.id ? [{ type: 'split', id: item.id, atFrame: f0, newId: middle } as AtomicAction] : []),
    ...(rest ? [{ type: 'split', id: middle, atFrame: f1, newId: rest } as AtomicAction] : []),
    { type: 'remove', id: middle },
    { type: 'add', startFrame: f0, item: stillItem as never },
    // play on from the frozen moment: the rest of the clip starts where the picture stopped
    ...(rest && a.resume === 'frozen' ? [{ type: 'retime', id: rest, srcInFrame: Math.round(sourceSec * fps) } as AtomicAction] : []),
  ];
  return { actions, stillId, atFrame: f0, holdFrames: f1 - f0, sourceSec };
}

export async function freezeFrameTool(raw: Record<string, unknown>, state: TimelineState, api: Pick<AnalyzeApi, 'stillFrame'>, newId: () => string): Promise<{ plan: FreezePlan; item: TimelineItem; clamped: boolean } | { error: string }> {
  const a = parseFreezeArgs(raw);
  if ('error' in a) return a;
  const item = freezeTarget(state, a);
  if ('error' in item) return item;
  if (!item.src || !api.stillFrame) return { error: 'this clip has no readable source file' };
  const atFrame = Math.max(item.startFrame, Math.min(item.startFrame + item.durationInFrames - 1, Math.round(a.atSec * state.fps)));
  const still = await api.stillFrame({ src: item.src }, sourceSecAt(item, atFrame, state.fps)).catch(() => null);
  if (!still) return { error: `could not read the frame of ${item.name} at that moment` };
  const plan = planFreeze(state, item, a, still, newId);
  return { plan, item, clamped: plan.holdFrames < Math.round(a.holdSec * state.fps) };
}
