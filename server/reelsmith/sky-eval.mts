// RS-1261's check: the sky mask (skyMath.ts) scored against hand-marked sky on real frames.
//   node --import tsx server/reelsmith/sky-eval.mts prepare <clips dir> <out dir> <clip@sec> ...
//   node --import tsx server/reelsmith/sky-eval.mts score <out dir> <marks.json> [--track]
// `prepare` takes each frame full size, runs the Photo depth model on it exactly as depthMapFor does (depthMap.ts) and
// saves the frame, its depth map and a gridded copy to mark by eye. `score` runs today's sky rule on the saved maps (no
// model run, so the rule can be tuned and scored again in seconds), rasterises the marks and reports, per frame, how much
// of the marked sky the mask covers and how much of the land it takes, ignoring a thin band along the marked outline
// (a hand-drawn polygon is only that exact) and any `ignore` polygons (leaves against the sky, a blur of both). What is
// scored is what the renderer draws over the frame: the map, then the sky found again in the frame by its colour
// (skyAt.glsl.txt, ported here). It writes an overlay per frame: red where it is sky, a yellow line on the marked outline.
// `prepare` also makes a three-tile depth track (RS-1260, depthTrack.ts) around each frame, the way a video clip with a sky
// effect gets its sky in the editor and the export; `score --track` scores the middle tile's sky (skyTrackMath.ts) instead.
// Marks: { "<frame id>": { "sky": [[[x, y], ...], ...], "land": [...], "ignore": [...], "band": 0.012, "note": "..." } },
// x and y in 0..1 of the frame (y down); `land` cuts the core of a head or tree out of the sky polygon and is always
// scored; `band` widens the unscored outline (a share of the short edge) for a motion-blurred edge.
// A frame with no "sky" polygons has no sky. Frame ids are `<clip name>@<ms>`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { probeVideo } from '../media-normalization.ts';
import { parseDepthTrackMeta, type DepthTrackMeta } from '../../shared/reelsmith/depthTrack.ts';
import { decodeFrames, depthTrackFor, readTiles } from './depthTrack.ts';
import { skyTrackFrom } from './skyTrackMath.ts';
import { depthToGray } from './depthMath.ts';
import { loadSharp, runDepthModel } from './depthMap.ts';
import { skyFromDepth, type SkyModel } from './skyMath.ts';

type Poly = [number, number][];
interface Mark { sky?: Poly[]; land?: Poly[]; ignore?: Poly[]; band?: number; note?: string }

const [mode, ...rest] = process.argv.slice(2);
const sharp = await loadSharp();

if (mode === 'prepare') {
  const [clipsDir, outArg, ...specs] = rest;
  if (!clipsDir || !outArg || !specs.length) throw new Error('usage: sky-eval.mts prepare <clips dir> <out dir> <clip@sec> ...');
  const out = resolve(outArg);
  for (const d of ['frames', 'depth', 'grid']) mkdirSync(join(out, d), { recursive: true });
  for (const spec of specs) {
    const [clip, sec] = spec.split('@') as [string, string];
    const id = `${basename(clip, extname(clip))}@${Math.round(Number(sec) * 1000)}`;
    const frame = join(out, 'frames', `${id}.jpg`);
    execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-ss', sec, '-i', join(clipsDir, clip), '-frames:v', '1', '-q:v', '2', frame]);
    // as depthMapFor: the model on a 518 px short edge, the map at 1036 snapped to the frame's edges
    const input = await sharp(frame).rotate().resize({ width: 518, height: 518, fit: 'outside', withoutEnlargement: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = await runDepthModel(new Uint8Array(input.data), input.info.width, input.info.height);
    const guide = await sharp(frame).rotate().resize({ width: 1036, height: 1036, fit: 'outside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const gray = depthToGray(result.depth, result.width, result.height, {
      guide: new Uint8Array(guide.data), outWidth: guide.info.width, outHeight: guide.info.height, radius: 12, eps: 1e-2, grow: 1, blur: 2,
    });
    await sharp(Buffer.from(gray), { raw: { width: guide.info.width, height: guide.info.height, channels: 1 } }).png().toFile(join(out, 'depth', `${id}.png`));
    await gridCopy(frame, join(out, 'grid', `${id}.jpg`));
    // the track: a link to the clip in out/clips (the track is saved next to its source), 3 tiles 1/8 s apart
    mkdirSync(join(out, 'clips'), { recursive: true });
    const link = join(out, 'clips', clip);
    if (!existsSync(link)) symlinkSync(resolve(clipsDir, clip), link);
    const track = await depthTrackFor(link, Number(sec) - 0.125, Number(sec) + 0.125);
    writeFileSync(join(out, 'depth', `${id}.track.json`), JSON.stringify({ clip, name: track.name }));
    console.log(`${id}  ${guide.info.width}x${guide.info.height}, track ${track.meta.count} tiles ${track.meta.tileWidth}x${track.meta.tileHeight}`);
  }
} else if (mode === 'score') {
  const [outArg, marksArg] = rest.filter((a) => !a.startsWith('--'));
  const useTrack = rest.includes('--track');
  if (!outArg || !marksArg) throw new Error('usage: sky-eval.mts score <out dir> <marks.json> [--track]');
  const out = resolve(outArg);
  const marks = JSON.parse(readFileSync(resolve(marksArg), 'utf8')) as Record<string, Mark>;
  const overlayDir = join(out, useTrack ? 'overlay-track' : 'overlay');
  mkdirSync(overlayDir, { recursive: true });
  const opts = process.env.SKY_OPTS ? JSON.parse(process.env.SKY_OPTS) : {};
  const rows: { id: string; skyPx: number; cover: number; land: number; share: number; ms: number; note?: string }[] = [];
  for (const [id, mark] of Object.entries(marks)) {
    if (id.startsWith('_')) continue;
    const map = useTrack ? await trackSky(out, id, opts) : await stillSky(out, id, opts);
    const ms = map.ms;
    // scored at the frame's size on what the renderer draws: the map, then the sky found again by its colour (skyAt)
    const pic = await sharp(join(out, 'frames', `${id}.jpg`)).rotate().resize({ width: 1036 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = pic.info.width, h = pic.info.height, n = w * h;
    const rgb = new Uint8Array(pic.data);
    const mask = renderedSky(map, rgb, w, h);
    // land cores (a head inside the sky polygon) are always scored, as land
    const landRef = raster(mark.land ?? [], w, h);
    const ref = raster(mark.sky ?? [], w, h);
    const ign = raster(mark.ignore ?? [], w, h);
    for (let p = 0; p < n; p++) if (landRef[p]) { ref[p] = 0; ign[p] = 0; }
    const band = Math.max(2, Math.round(Math.min(w, h) * (mark.band ?? 0.012)));
    const edge = outline(ref, w, h, band);
    for (let p = 0; p < n; p++) if (landRef[p]) edge[p] = 0;
    let sky = 0, hit = 0, land = 0, wrong = 0;
    for (let p = 0; p < n; p++) {
      if (ign[p] || edge[p]) continue;
      const said = mask[p]! > 127;
      if (ref[p]) { sky++; if (said) hit++; } else { land++; if (said) wrong++; }
    }
    rows.push({ id, skyPx: sky / n, cover: sky ? hit / sky : NaN, land: land ? wrong / land : 0, share: [...mask].filter((v) => v > 127).length / n, ms, note: mark.note });
    // overlay: the frame, red where the mask says sky, yellow on the marked outline, grey over ignored parts
    const ov = Buffer.from(rgb);
    for (let p = 0; p < n; p++) {
      const a = mask[p]! / 255 * 0.55;
      ov[p * 3] = Math.round(ov[p * 3]! * (1 - a) + 255 * a); ov[p * 3 + 1] = Math.round(ov[p * 3 + 1]! * (1 - a)); ov[p * 3 + 2] = Math.round(ov[p * 3 + 2]! * (1 - a));
      if (ign[p] && (p % w + Math.floor(p / w)) % 6 === 0) { ov[p * 3] = 128; ov[p * 3 + 1] = 128; ov[p * 3 + 2] = 128; }
    }
    const thin = outline(ref, w, h, 1);
    for (let p = 0; p < n; p++) if (thin[p]) { ov[p * 3] = 255; ov[p * 3 + 1] = 230; ov[p * 3 + 2] = 0; }
    await sharp(ov, { raw: { width: w, height: h, channels: 3 } }).resize({ width: 360 }).jpeg({ quality: 82 }).toFile(join(overlayDir, `${id}.jpg`));
  }
  const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '  -  ');
  console.log('frame              marked sky  covered   land as sky  mask share   ms');
  for (const r of rows) console.log(`${r.id.padEnd(18)} ${pct(r.skyPx).padStart(9)} ${pct(r.cover).padStart(9)} ${pct(r.land).padStart(11)} ${pct(r.share).padStart(11)} ${r.ms.toFixed(0).padStart(5)}${r.note ? `  ${r.note}` : ''}`);
  const withSky = rows.filter((r) => r.skyPx > 0);
  const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : NaN; };
  const passCover = withSky.filter((r) => r.cover >= 0.95).length, passLand = rows.filter((r) => r.land < 0.02).length;
  console.log(`\n${withSky.length} frames with sky: median covered ${pct(median(withSky.map((r) => r.cover)))}, ${passCover}/${withSky.length} at 95%+`);
  console.log(`${rows.length} frames: median land as sky ${pct(median(rows.map((r) => r.land)))}, ${passLand}/${rows.length} under 2%`);
  writeFileSync(join(out, useTrack ? 'report-track.json' : 'report.json'), JSON.stringify({ rows, passCover, passLand, withSky: withSky.length, frames: rows.length }, null, 2));
} else {
  throw new Error('usage: sky-eval.mts prepare|score ...');
}

interface SkyMapAt { w: number; h: number; mask: Uint8Array; gate: Uint8Array; model: SkyModel | null; ms: number }

/** The sky the renderer draws over a frame from a sky map (src/gl/fx/skyAt.glsl.txt, ported line for line): the map's red
 *  times a loose colour test, or its gate times the full one; without a colour model the map alone. 0..255. */
function renderedSky(map: SkyMapAt, rgb: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const sample = (src: Uint8Array, u: number, v: number) => {
    const x = Math.min(map.w - 1, Math.max(0, u * map.w - 0.5)), y = Math.min(map.h - 1, Math.max(0, v * map.h - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(map.w - 1, x0 + 1), y1 = Math.min(map.h - 1, y0 + 1), tx = x - x0, ty = y - y0;
    const a = src[y0 * map.w + x0]! * (1 - tx) + src[y0 * map.w + x1]! * tx, b = src[y1 * map.w + x0]! * (1 - tx) + src[y1 * map.w + x1]! * tx;
    return (a * (1 - ty) + b * ty) / 255;
  };
  const m = map.model;
  const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const skyColour = (c: [number, number, number], widen: number, needPale: number) => {
    const sum = c[0] + c[1] + c[2] + 0.004, chx = c[0] / sum, chy = c[1] / sum;
    const bx = 1 / 3 - m!.chroma[0], by = 1 / 3 - m!.chroma[1];
    const t = Math.min(1, Math.max(0, ((chx - m!.chroma[0]) * bx + (chy - m!.chroma[1]) * by) / Math.max(bx * bx + by * by, 1e-9)));
    const d = Math.hypot((chx - m!.chroma[0] - t * bx) / Math.max(m!.spread[0], 1e-4), (chy - m!.chroma[1] - t * by) / Math.max(m!.spread[1], 1e-4));
    const lim = m!.limit * widen;
    const colour = 1 - ss(lim * 0.85, lim * 1.2, d);
    const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    const bright = ss(m!.lumaFloor - 0.04, m!.lumaFloor + 0.02, l);
    const pale = 1 + (ss(m!.paleFloor - 0.04, m!.paleFloor + 0.02, l) - 1) * ss(0.15, 0.25, t) * needPale;
    const mx = Math.max(...c), mn = Math.min(...c);
    const haze = (1 - ss(0.2, 0.26, (mx - mn) / Math.max(mx, 1e-3))) * ss(m!.paleFloor - 0.04, m!.paleFloor + 0.02, l) * needPale;
    return Math.max(colour * bright * pale, haze);
  };
  const o = 6;
  const px = (x: number, y: number, k: number) => rgb[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3 + k]! / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    const r = sample(map.mask, u, v);
    if (!m) { out[y * w + x] = Math.round(r * 255); continue; }
    const g = sample(map.gate, u, v);
    if (r <= 0 && g <= 0) continue;
    const c = [0, 1, 2].map((k) => (px(x, y, k) * 2 + px(x + o, y, k) + px(x - o, y, k) + px(x, y + o, k) + px(x, y - o, k)) / 6) as [number, number, number];
    out[y * w + x] = Math.round(Math.max(r * skyColour(c, 1.4, 0), g * skyColour(c, 0.8, 1)) * 255);
  }
  return out;
}

/** Today's rule on a frame's still depth map, as a photo gets it (no gate past the sky). */
async function stillSky(out: string, id: string, opts: object): Promise<SkyMapAt> {
  const depth = await sharp(join(out, 'depth', `${id}.png`)).raw().toBuffer({ resolveWithObject: true });
  const w = depth.info.width, h = depth.info.height, n = w * h;
  const gray = Uint8Array.from({ length: n }, (_, p) => depth.data[p * depth.info.channels]!);
  const pic = await sharp(join(out, 'frames', `${id}.jpg`)).rotate().resize({ width: w, height: h, fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = new Uint8Array(pic.data);
  const t0 = performance.now();
  const { mask, gate, model } = skyFromDepth(gray, rgb, w, h, { gateReach: 0, ...opts });
  return { w, h, mask, gate, model, ms: performance.now() - t0 };
}

/** Today's rule on the middle tile of the frame's three-tile depth track, as skyTrackFrom finds it for a video. */
async function trackSky(out: string, id: string, opts: object): Promise<SkyMapAt> {
  const { clip, name } = JSON.parse(readFileSync(join(out, 'depth', `${id}.track.json`), 'utf8')) as { clip: string; name: string };
  const atlas = join(out, 'clips', name);
  const meta = parseDepthTrackMeta(JSON.parse(readFileSync(atlas.replace(/\.png$/i, '.json'), 'utf8'))) as DepthTrackMeta;
  const grays = await readTiles(sharp, atlas, meta);
  const probe = await probeVideo(join(out, 'clips', clip));
  const rgbs = await decodeFrames(join(out, 'clips', clip), meta.fromSec, meta.step, meta.count, meta.tileWidth, meta.tileHeight, probe.hdr === true);
  const t0 = performance.now();
  const track = skyTrackFrom(grays, rgbs, meta.tileWidth, meta.tileHeight, opts);
  const mid = Math.floor(meta.count / 2);
  return { w: meta.tileWidth, h: meta.tileHeight, mask: track.masks[mid]!, gate: track.gates[mid]!, model: track.models[mid]!, ms: performance.now() - t0 };
}

/** A copy of the frame 540 wide with a line every tenth and a faint one every twentieth, numbered, to mark by eye. */
async function gridCopy(frame: string, to: string): Promise<void> {
  const meta = await sharp(frame).metadata();
  const W = 540, H = Math.round((W * (meta.height ?? 960)) / (meta.width ?? 540));
  const lines: string[] = [];
  for (let k = 1; k < 20; k++) {
    const major = k % 2 === 0, x = (W * k) / 20, y = (H * k) / 20;
    const s = major ? 'stroke="#0ff" stroke-opacity="0.8" stroke-width="1"' : 'stroke="#0ff" stroke-opacity="0.35" stroke-width="0.6"';
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" ${s}/><line x1="0" y1="${y}" x2="${W}" y2="${y}" ${s}/>`);
    if (major) lines.push(`<text x="${x + 2}" y="11" font-size="10" fill="#ff0" font-family="Helvetica">${k * 5}</text><text x="2" y="${y - 2}" font-size="10" fill="#ff0" font-family="Helvetica">${k * 5}</text>`);
  }
  const svg = Buffer.from(`<svg width="${W}" height="${H}">${lines.join('')}</svg>`);
  await sharp(frame).rotate().resize({ width: W, height: H, fit: 'fill' }).composite([{ input: svg }]).jpeg({ quality: 85 }).toFile(to);
}

/** Polygons (0..1) filled at w x h, even-odd per polygon, unioned. */
function raster(polys: Poly[], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (const poly of polys) {
    const pts = poly.map(([x, y]) => [x * w, y * h] as const);
    for (let y = 0; y < h; y++) {
      const cy = y + 0.5, xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!, [xj, yj] = pts[j]!;
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1]! - 0.5)); x++) m[y * w + x] = 1;
      }
    }
  }
  return m;
}

/** Pixels within `r` of a change in `m` (inside or out), not counting the frame's own border. */
function outline(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const e = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if ((x + 1 < w && m[p] !== m[p + 1]) || (y + 1 < h && m[p] !== m[p + w])) e[p] = 1;
  }
  if (r <= 1) return e;
  // widen by r with a separable max
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) { if (e[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (e[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
  }
  return out;
}
