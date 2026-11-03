// RS-1261: the sky of every tile of a depth track (RS-1260), so a handheld shot that swings past the frame one still map
// was made from keeps its sky. Each tile's sky is found as a photo's is (skyMath.ts), from the tile's depth stretched to
// its own range (the track shares one range, and the sky rule wants the far end of each frame at 0) and its picture;
// then each pixel takes the median of its tile and the tiles either side, so a hazy valley that is sky in one tile and
// land in the next does not flicker; then the gate is drawn round the result, narrow, since the next map is an eighth of a
// second away. Pure maths on plain arrays.
import { skyFromDepth, skyGate, type SkyModel } from './skyMath.ts';

export interface SkyTrack {
  /** per tile: 0..255, the sky in that tile */
  masks: Uint8Array[];
  /** per tile: where the sky can be between this tile and its neighbours */
  gates: Uint8Array[];
  /** per tile: the sky's colour, or null when the tile has none */
  models: (SkyModel | null)[];
}

/** Between two maps a phone moves little: a fiftieth of the short edge. */
export const TRACK_GATE_REACH = 0.02;

/** `gray` stretched so its 2nd percentile is 0 and its 98th 255. */
export function stretchOwnRange(gray: Uint8Array): Uint8Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!]! += 1;
  const at = (q: number) => { let seen = 0; for (let v = 0; v < 256; v++) { seen += hist[v]!; if (seen > gray.length * q) return v; } return 255; };
  const lo = at(0.02), hi = at(0.98);
  if (hi - lo < 4) return gray.slice();
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.min(255, Math.max(0, Math.round(((gray[i]! - lo) * 255) / (hi - lo))));
  return out;
}

const med3 = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** The sky of each tile: `grays` (0 far .. 255 near) and `rgbs` (RGB) per tile, all `w` x `h`. */
export function skyTrackFrom(grays: Uint8Array[], rgbs: Uint8Array[], w: number, h: number): SkyTrack {
  const own = grays.map((g, i) => skyFromDepth(stretchOwnRange(g), rgbs[i]!, w, h, { blur: 1, gateReach: TRACK_GATE_REACH }));
  const n = w * h;
  const masks = own.map((cur, k) => {
    if (own.length < 3) return cur.mask;
    const prev = own[Math.max(0, k - 1)]!.mask, next = own[Math.min(own.length - 1, k + 1)]!.mask;
    // the first and last tile have one neighbour: the median of it, itself and itself is itself
    if (k === 0 || k === own.length - 1) return cur.mask;
    const out = new Uint8Array(n);
    for (let p = 0; p < n; p++) out[p] = med3(prev[p]!, cur.mask[p]!, next[p]!);
    return out;
  });
  const gates = masks.map((m) => skyGate(m, w, h, TRACK_GATE_REACH));
  // a tile whose own rule found no sky but whose median kept some takes its nearest neighbour's colour
  const models = masks.map((m, k) => {
    if (own[k]!.model) return own[k]!.model;
    let any = false;
    for (let p = 0; p < n && !any; p += 7) any = m[p]! > 127;
    if (!any) return null;
    for (let d = 1; d < own.length; d++) {
      const near = own[k - d]?.model ?? own[k + d]?.model;
      if (near) return near;
    }
    return null;
  });
  return { masks, gates, models };
}
