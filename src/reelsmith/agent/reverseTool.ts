// reels_reverse (RS-1223): play a video clip, or a stretch of it, backwards; or put a reversed clip back to forwards.
// A stretch is split off first (like a freeze), so the rest of the clip and every cut after it stay where they are.
import type { AtomicAction } from '../../editor/reducerActions';
import type { TimelineItem, TimelineState } from '../../editor/types';
import { linkedItemIds } from '../../editor/linkGroups';
import { forwardsActions, isReversed, reverseActions, reverseSpanOf } from '../clipOps';
import type { AnalyzeApi } from '../runRecipe';
import { freezeTarget } from './freezeFrameTool';

export interface ReverseArgs {
  /** a timeline second inside the clip (default: fromSec) */
  atSec?: number;
  itemId?: string;
  /** the stretch to reverse, in timeline seconds (default: the whole clip) */
  fromSec?: number;
  toSec?: number;
  /** put a reversed clip back to forwards */
  forwards: boolean;
}

const sec = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function parseReverseArgs(raw: Record<string, unknown>): ReverseArgs | { error: string } {
  for (const k of ['atSec', 'fromSec', 'toSec'] as const) if (raw[k] !== undefined && !sec(raw[k])) return { error: `${k} must be a timeline second (>= 0)` };
  if (raw.forwards !== undefined && typeof raw.forwards !== 'boolean') return { error: 'forwards must be true or false' };
  const atSec = (raw.atSec ?? raw.fromSec) as number | undefined;
  if (atSec === undefined && !(typeof raw.itemId === 'string' && raw.itemId)) return { error: 'name the clip: itemId, or atSec (a timeline second inside it)' };
  if (sec(raw.fromSec) && sec(raw.toSec) && (raw.toSec as number) <= (raw.fromSec as number)) return { error: 'toSec must be after fromSec' };
  return {
    forwards: raw.forwards === true,
    ...(atSec !== undefined ? { atSec } : {}),
    ...(typeof raw.itemId === 'string' && raw.itemId ? { itemId: raw.itemId } : {}),
    ...(sec(raw.fromSec) ? { fromSec: raw.fromSec as number } : {}),
    ...(sec(raw.toSec) ? { toSec: raw.toSec as number } : {}),
  };
}

function target(state: TimelineState, a: ReverseArgs): TimelineItem | { error: string } {
  if (a.atSec === undefined) {
    const item = state.items.find((i) => i.id === a.itemId || i.id.startsWith(a.itemId!));
    return item && item.kind === 'video' ? item : { error: `no video clip ${a.itemId}` };
  }
  return freezeTarget(state, { atSec: a.atSec, holdSec: 1, resume: 'frozen', ...(a.itemId ? { itemId: a.itemId } : {}) });
}

export interface ReversePlan { actions: AtomicAction[]; itemId: string; from: number; to: number; label: string }

export async function reverseTool(raw: Record<string, unknown>, state: TimelineState, api: Pick<AnalyzeApi, 'reverseClip'>, newId: () => string): Promise<ReversePlan | { error: string }> {
  const a = parseReverseArgs(raw);
  if ('error' in a) return a;
  const item = target(state, a);
  if ('error' in item) return item;
  const end = item.startFrame + item.durationInFrames;
  if (a.forwards) {
    const actions = forwardsActions(item);
    return actions ? { actions, itemId: item.id, from: item.startFrame, to: end, label: `Play ${item.name} forwards` } : { error: `${item.id} is not reversed` };
  }
  if (isReversed(item)) return { error: `${item.id} is already reversed; forwards true puts it back` };
  if (!item.src) return { error: 'this clip has no source file' };
  if (linkedItemIds(state, [item.id]).length > 1) return { error: `${item.id} is linked to other clips; unlink it first, or they would keep playing forwards` };
  const fps = state.fps;
  const f0 = a.fromSec === undefined ? item.startFrame : Math.max(item.startFrame, Math.min(end - 1, Math.round(a.fromSec * fps)));
  const f1 = a.toSec === undefined ? end : Math.max(f0 + 1, Math.min(end, Math.round(a.toSec * fps)));
  if (f1 - f0 < 2) return { error: 'the stretch to reverse is shorter than two frames' };
  const middleId = f0 > item.startFrame ? newId() : item.id;
  const restId = f1 < end ? newId() : undefined;
  // the stretch as it will be after the splits: same source and look, starting further into the source
  const rate = item.playbackRate ?? 1;
  const middle: TimelineItem = { ...item, id: middleId, startFrame: f0, durationInFrames: f1 - f0, srcInFrame: (item.srcInFrame ?? 0) + (f0 - item.startFrame) * rate };
  const span = reverseSpanOf(middle, fps);
  if (!api.reverseClip) return { error: 'reversing is not available' };
  const rev = await api.reverseClip(item.src, span.startSec, span.frames, fps).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
  if ('error' in rev) return { error: `could not reverse ${item.name}: ${rev.error}` };
  return {
    actions: [
      ...(middleId !== item.id ? [{ type: 'split', id: item.id, atFrame: f0, newId: middleId } as AtomicAction] : []),
      ...(restId ? [{ type: 'split', id: middleId, atFrame: f1, newId: restId } as AtomicAction] : []),
      ...reverseActions(middle, rev),
    ],
    itemId: middleId, from: f0, to: f1, label: `Reverse ${item.name}`,
  };
}
