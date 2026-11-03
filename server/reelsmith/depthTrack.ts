// RS-1260: a depth track for the span of a video a clip shows: the depth model a few times a second (the Photo depth
// model, depth-lite, shared with depthMap.ts and its queue), lined up and smoothed in time (depthTrackMath.ts), each
// tile snapped to its frame's edges, saved next to the source as one atlas `<name>.depthv-<from>-<to>.png` (white = near)
// and its index `.json` (shared/reelsmith/depthTrack.ts). Made once per span and reused while newer than the source.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { HDR_TO_SDR_FILTERS, probeVideo } from '../media-normalization.ts';
import { depthTrackMetaName, MAX_TRACK_SEC, parseDepthTrackMeta, subjectDepth, trackLayout, type DepthTrackMeta } from '../../shared/reelsmith/depthTrack.ts';
import { depthPackInstalled, loadSharp, runDepthModel } from './depthMap.ts';
import { boxMean, guidedFilterRgb, resizeBilinear } from './depthMath.ts';
import { stabiliseTrack, type RawFrame } from './depthTrackMath.ts';

export interface DepthTrack { name: string; meta: DepthTrackMeta; cached: boolean; ms: number }

const ms = (sec: number) => Math.max(0, Math.round(sec * 1000));

/** File name of the depth track of `sourceName` from `fromSec` to `toSec` (source seconds). */
export function depthTrackName(sourceName: string, fromSec: number, toSec: number): string {
  return `${basename(sourceName, extname(sourceName))}.depthv-${ms(fromSec)}-${ms(toSec)}.png`;
}

/** `count` frames of `w` x `h` RGB from `fromSec`, `step` seconds apart (ffmpeg applies the phone's rotation). */
function decodeFrames(file: string, fromSec: number, step: number, count: number, w: number, h: number, hdr: boolean): Promise<Uint8Array[]> {
  const rate = step > 0 ? 1 / step : 1;
  const filters = [...(hdr ? HDR_TO_SDR_FILTERS : []), `fps=${rate.toFixed(6)}:round=near`, `scale=${w}:${h}:flags=area`, 'format=rgb24'];
  const args = ['-v', 'error', '-ss', String(Math.max(0, fromSec)), '-i', file, '-an', '-t', String(step * Math.max(0, count - 1) + 0.25),
    '-vf', filters.join(','), '-frames:v', String(count), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (c: Buffer) => chunks.push(c));
    p.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error(`depth track decode failed: ${err.trim().slice(-400)}`)); return; }
      const all = Buffer.concat(chunks);
      const size = w * h * 3;
      const frames: Uint8Array[] = [];
      for (let o = 0; o + size <= all.length; o += size) frames.push(new Uint8Array(all.buffer, all.byteOffset + o, size));
      if (!frames.length) { reject(new Error('depth track decode gave no frames')); return; }
      // a span that ends at the clip's last frame can come out a frame short: repeat the last
      while (frames.length < count) frames.push(frames[frames.length - 1]!);
      resolve(frames);
    });
  });
}

const flights = new Map<string, Promise<DepthTrack>>();

/** The depth track of a video from `fromSec` to `toSec` (at most MAX_TRACK_SEC). */
export function depthTrackFor(file: string, fromSec: number, toSec: number): Promise<DepthTrack> {
  const from = Math.max(0, fromSec);
  const to = Math.min(Math.max(from, toSec), from + MAX_TRACK_SEC);
  const name = depthTrackName(file, from, to);
  const out = join(dirname(file), name);
  const metaPath = depthTrackMetaName(out);
  const existing = flights.get(out);
  if (existing) return existing;
  const work = (async (): Promise<DepthTrack> => {
    const started = performance.now();
    if (existsSync(out) && existsSync(metaPath) && (await stat(out)).mtimeMs >= (await stat(file)).mtimeMs) {
      const meta = parseDepthTrackMeta(JSON.parse(await readFile(metaPath, 'utf8')));
      if (meta) return { name, meta, cached: true, ms: 0 };
    }
    if (!depthPackInstalled()) throw new Error('the depth-lite model pack is not installed');
    const probe = await probeVideo(file);
    const layout = trackLayout(from, to, probe.width, probe.height);
    const { tileWidth: w, tileHeight: h, count } = layout;
    const pictures = await decodeFrames(file, from, layout.step, count, w, h, probe.hdr === true);
    const raw: RawFrame[] = [];
    for (const rgb of pictures) {
      const r = await runDepthModel(rgb, w, h);
      raw.push({ depth: r.width === w && r.height === h ? r.depth : resizeBilinear(r.depth, r.width, r.height, w, h), width: w, height: h });
    }
    const steady = stabiliseTrack(raw);
    const atlasW = layout.cols * w, atlasH = layout.rows * h;
    const atlas = Buffer.alloc(atlasW * atlasH);
    const subject: number[] = [];
    steady.forEach((d, i) => {
      // the tile's edges snapped to its own frame's (as a photo's map is, at this size), then a short ramp
      const guide = new Float32Array(w * h * 3);
      const rgb = pictures[i]!;
      for (let k = 0; k < guide.length; k++) guide[k] = rgb[k]! / 255;
      const snapped = boxMean(guidedFilterRgb(guide, d, w, h, 5, 1e-2), w, h, 1);
      const gray = new Uint8Array(w * h);
      for (let k = 0; k < gray.length; k++) gray[k] = Math.round(snapped[k]! * 255);
      subject.push(subjectDepth(gray, w, h));
      const ox = (i % layout.cols) * w, oy = Math.floor(i / layout.cols) * h;
      for (let y = 0; y < h; y++) atlas.set(gray.subarray(y * w, (y + 1) * w), (oy + y) * atlasW + ox);
    });
    const sharp = await loadSharp();
    await sharp(atlas, { raw: { width: atlasW, height: atlasH, channels: 1 } }).png().toFile(out);
    const meta: DepthTrackMeta = { version: 1, fromSec: from, step: layout.step, count, cols: layout.cols, rows: layout.rows, tileWidth: w, tileHeight: h, subject };
    await writeFile(metaPath, JSON.stringify(meta));
    return { name, meta, cached: false, ms: Math.round(performance.now() - started) };
  })();
  flights.set(out, work);
  return work.finally(() => flights.delete(out));
}
