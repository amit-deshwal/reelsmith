// RS-1260: depth for every frame of a video span (a "depth track"). The depth model runs a few times a second of the span
// (server/reelsmith/depthTrack.ts); the maps are lined up and smoothed over time so a still background does not flicker,
// and saved as one atlas image of tiles (row by row) with an index beside it. The editor and the export renderer blend
// the two tiles either side of each frame into the depth map the shaders read (u_depth), so the effects see one map per
// frame, as they do for a photo.

/** The index saved beside a depth track's atlas (`<atlas>.json`). */
export interface DepthTrackMeta {
  version: 1;
  /** source seconds of the first tile, and between tiles */
  fromSec: number;
  step: number;
  count: number;
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  /** per tile: the depth (0 far .. 1 near) of the shot's subject (the near thing in the middle of the frame) */
  subject: number[];
}

/** Tiles a second of the span; a longer span gets fewer (down to MIN_RATE), and the longest is MAX_TRACK_SEC. */
export const TRACK_RATE = 8;
export const MIN_TRACK_RATE = 3;
export const MAX_TRACK_SEC = 30;
/** The atlas stays within a texture every GPU takes. */
export const MAX_ATLAS_EDGE = 4096;
/** Short edge of a tile; a long span gets smaller tiles before it gets fewer of them (down to MIN_TILE_EDGE). */
export const TILE_SHORT_EDGE = 360;
export const MIN_TILE_EDGE = 240;

/** The tile size for a frame of `width` x `height` (its aspect kept, short edge `edge`). */
export function tileSize(width: number, height: number, edge = TILE_SHORT_EDGE): { tileWidth: number; tileHeight: number } {
  const s = edge / Math.max(1, Math.min(width, height));
  const even = (v: number) => Math.max(2, Math.round((v * s) / 2) * 2);
  return { tileWidth: even(width), tileHeight: even(height) };
}

export interface TrackLayout { count: number; step: number; cols: number; rows: number; tileWidth: number; tileHeight: number }

/** How many tiles a span of a `width` x `height` video gets, how far apart, how big, and how they sit in the atlas. */
export function trackLayout(fromSec: number, toSec: number, width: number, height: number): TrackLayout {
  const span = Math.max(0, Math.min(MAX_TRACK_SEC, toSec - fromSec));
  // the first and last frame of the span both get a tile
  const want = span <= 0 ? 1 : Math.max(2, Math.ceil(span * TRACK_RATE) + 1);
  const floor = span <= 0 ? 1 : Math.max(2, Math.ceil(span * MIN_TRACK_RATE) + 1);
  let edge = TILE_SHORT_EDGE;
  for (;;) {
    const { tileWidth, tileHeight } = tileSize(width, height, edge);
    const maxCols = Math.max(1, Math.floor(MAX_ATLAS_EDGE / tileWidth));
    const room = maxCols * Math.max(1, Math.floor(MAX_ATLAS_EDGE / tileHeight));
    if (room >= want || edge <= MIN_TILE_EDGE || (room >= floor && edge <= MIN_TILE_EDGE + 40)) {
      const count = Math.max(1, Math.min(room, want));
      const cols = Math.min(maxCols, count);
      return { count, step: count > 1 ? span / (count - 1) : 0, cols, rows: Math.ceil(count / cols), tileWidth, tileHeight };
    }
    edge -= 40;
  }
}

/** Which tiles a moment of the source falls between, and how far from the first to the second (0..1). */
export function tilesAt(meta: Pick<DepthTrackMeta, 'fromSec' | 'step' | 'count'>, sourceSec: number): { a: number; b: number; t: number } {
  if (meta.count <= 1 || meta.step <= 0) return { a: 0, b: 0, t: 0 };
  const pos = Math.min(meta.count - 1, Math.max(0, (sourceSec - meta.fromSec) / meta.step));
  const a = Math.min(meta.count - 1, Math.floor(pos));
  const b = Math.min(meta.count - 1, a + 1);
  return { a, b, t: b === a ? 0 : pos - a };
}

/** Where tile `i` sits in the atlas, in atlas pixels. */
export function tileRect(meta: Pick<DepthTrackMeta, 'cols' | 'tileWidth' | 'tileHeight'>, i: number): { x: number; y: number; w: number; h: number } {
  return { x: (i % meta.cols) * meta.tileWidth, y: Math.floor(i / meta.cols) * meta.tileHeight, w: meta.tileWidth, h: meta.tileHeight };
}

/** The subject's depth at a moment, between its two tiles. */
export function subjectAt(meta: DepthTrackMeta, sourceSec: number): number {
  const { a, b, t } = tilesAt(meta, sourceSec);
  return (meta.subject[a] ?? 0.7) * (1 - t) + (meta.subject[b] ?? meta.subject[a] ?? 0.7) * t;
}

/**
 * The depth of the shot's subject in an 8-bit map (white = near), 0..1: the near part of the middle of the frame, where
 * a person in front of a view stands. Among the pixels of the middle (a third of the width each side of centre, from a
 * fifth to nine tenths of the height) the ones in the nearer half of that region's depth range, and their median.
 */
export function subjectDepth(gray: ArrayLike<number>, width: number, height: number, channels = 1): number {
  const vals: number[] = [];
  const x0 = Math.floor(width * 0.3), x1 = Math.ceil(width * 0.7), y0 = Math.floor(height * 0.2), y1 = Math.ceil(height * 0.9);
  const stepX = Math.max(1, Math.floor((x1 - x0) / 48)), stepY = Math.max(1, Math.floor((y1 - y0) / 80));
  for (let y = y0; y < y1; y += stepY) for (let x = x0; x < x1; x += stepX) vals.push(gray[(y * width + x) * channels]! / 255);
  if (!vals.length) return 0.7;
  vals.sort((p, q) => p - q);
  const lo = vals[Math.floor(vals.length * 0.05)]!, hi = vals[Math.floor(vals.length * 0.98)]!;
  const near = vals.filter((v) => v >= (lo + hi) / 2);
  return Math.round((near[Math.floor(near.length / 2)] ?? hi) * 1000) / 1000;
}

export function parseDepthTrackMeta(raw: unknown): DepthTrackMeta | null {
  const m = raw as Partial<DepthTrackMeta> | null;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!m || m.version !== 1 || ![m.fromSec, m.step, m.count, m.cols, m.rows, m.tileWidth, m.tileHeight].every(num)) return null;
  if (!Array.isArray(m.subject) || m.subject.length !== m.count || !m.subject.every(num)) return null;
  if (m.count! < 1 || m.cols! < 1 || m.tileWidth! < 1 || m.tileHeight! < 1) return null;
  return m as DepthTrackMeta;
}

/** The index beside an atlas. */
export const depthTrackMetaName = (atlasFileOrSrc: string) => atlasFileOrSrc.replace(/\.png$/i, '.json');
