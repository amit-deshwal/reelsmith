// Shared pieces of the director's moves (RS-1201): the move contract, param readers and the item helpers every move uses.
import type { AtomicAction } from '../../editor/reducerActions';
import type { AssemblyClip } from '../assembler/types';
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';

export interface MoveParam {
  id: string;
  type: 'number' | 'boolean' | 'enum' | 'color' | 'text';
  label: string;
  default: PlanValue;
  min?: number;
  max?: number;
  options?: string[];
}

export interface MoveContext {
  W: number;
  H: number;
  fps: number;
  /** section frames on the reel, [start, end) */
  start: number;
  end: number;
  /** frame of beat b counted from the section start (fractions allowed) */
  beatFrame: (b: number) => number;
  beats: number;
  clips: AssemblyClip[];
  params: Record<string, PlanValue>;
  seed: number;
  /** stable item id for this section */
  id: (...parts: Array<string | number>) => string;
  /** video lane for layer n of this section (0 = lowest); text lanes are separate */
  layer: (n: number) => string;
  /** a moment of `frames` frames in the clip, away from where it already played in this reel */
  moment: (clip: AssemblyClip, frames: number) => { inFrame: number; loop: boolean };
  emit: (action: AtomicAction) => void;
  warn: (message: string) => void;
  /** gain of the bottom layer's clip audio: 0 under a song, 1 when the reel has no song and keeps the clips' own sound */
  clipVolume?: number;
  /** what the previous section left on screen: the band's cover fraction when it was a postcard band */
  previous?: { move: string; bandCover?: number };
}

export interface MoveDef {
  id: string;
  name: string;
  looks: string;
  use: string;
  /** clips the move takes: min, the number it uses by default, and max (null: one per shot, from beats and params) */
  clips: { min: number; max: number };
  beats: { min: number; default: number; max: number };
  /** shot tags that suit the move's clips, best first, for automatic casting */
  wants?: string[];
  params: MoveParam[];
  /** clips needed for `beats` beats with these params (for automatic casting) */
  clipCount?: (beats: number, params: Record<string, PlanValue>, W: number, H: number) => number;
  build: (ctx: MoveContext) => void;
  /** set on the section that follows: lets the next move continue the picture (the band's last cover) */
  leaves?: (ctx: Pick<MoveContext, 'params'>) => { bandCover?: number };
}

export const num = (v: PlanValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const str = (v: PlanValue | undefined, d: string) => (typeof v === 'string' ? v : d);
export const bool = (v: PlanValue | undefined, d: boolean) => (typeof v === 'boolean' ? v : d);

// ---- item helpers ----------------------------------------------------------------------------------------------------

export function clipAt(ctx: MoveContext, layer: number, key: Array<string | number>, clip: AssemblyClip, from: number, to: number, inFrame: number, extra: Record<string, unknown> = {}): string {
  const id = ctx.id(...key);
  ctx.emit({
    type: 'add', startFrame: from,
    item: {
      id, track: ctx.layer(layer), kind: clip.kind, name: clip.name, src: clip.src, sourceAssetId: clip.assetId, durationInFrames: Math.max(1, to - from),
      ...(clip.kind === 'video' ? { srcInFrame: inFrame, volume: layer === 0 ? ctx.clipVolume ?? 0 : 0 } : {}), ...extra,
    } as never,
  });
  return id;
}

export function solid(ctx: MoveContext, layer: number, key: Array<string | number>, name: string, from: number, to: number, color: string, extra: Record<string, unknown> = {}): string {
  const id = ctx.id(...key);
  ctx.emit({ type: 'add', startFrame: from, item: { id, track: ctx.layer(layer), kind: 'solid', name, durationInFrames: Math.max(1, to - from), width: ctx.W, height: ctx.H, ...extra, props: { ...(extra.props as Record<string, unknown> | undefined), color } } as never });
  return id;
}

