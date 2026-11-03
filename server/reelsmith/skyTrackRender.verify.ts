// RS-1261, per frame, rendered: on a video the sky comes from the depth track's sky atlas, one map per tile, blended to
// each frame, so a camera that tilts up keeps the land it uncovers out of the sky. A 2 s shot: blue sky over the top half
// for the first second, then over the top quarter only (the camera tilted). A land-only invert through the export
// renderer: in the first second the band from a quarter to a half down is sky and stays; in the second it is land and is
// inverted. With one still map (the first frame's) that band would stay un-inverted all through.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type ClipEffect } from '../../src/editor/types.ts';
import type { DepthTrackMeta } from '../../shared/reelsmith/depthTrack.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { loadSharp } from './depthMap.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';

const W = 360, H = 640, FPS = 30, SEC = 2;
const horizon = (t: number) => (t < 1 ? H / 2 : H / 4);
const work = mkdtempSync(join(tmpdir(), 'rs-sky-track-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  const frames = FPS * SEC;
  const raw = Buffer.alloc(W * H * 3 * frames);
  for (let f = 0; f < frames; f++) {
    const hz = horizon(f / FPS);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.set(y < hz ? [0x6a, 0xa0, 0xe0] : [0x4a, 0x8a, 0x3a], ((f * H + y) * W + x) * 3);
  }
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0', '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv420p', join(media, 'tilt.mp4')], { input: raw });
  // its track: five tiles half a second apart, a quarter of the frame's size; depth (sky far) and sky (red = sky, green = gate)
  const tw = W / 4, th = H / 4, count = 5, step = 0.5;
  const depth = Buffer.alloc(tw * count * th), sky = Buffer.alloc(tw * count * th * 3);
  for (let k = 0; k < count; k++) {
    const hz = horizon(k * step) / 4;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const p = y * tw * count + k * tw + x;
      depth[p] = y < hz ? 0 : 190;
      if (y < hz) { sky[p * 3] = 255; sky[p * 3 + 1] = 255; }
    }
  }
  const sharp = await loadSharp();
  await sharp(depth, { raw: { width: tw * count, height: th, channels: 1 } }).png().toFile(join(media, 'tilt.depthv-0-2000.png'));
  await sharp(sky, { raw: { width: tw * count, height: th, channels: 3 } }).png().toFile(join(media, 'tilt.depthv-0-2000.sky.png'));
  const meta: DepthTrackMeta = { version: 1, fromSec: 0, step, count, cols: count, rows: 1, tileWidth: tw, tileHeight: th, subject: Array(count).fill(0.75), sky: Array(count).fill(null) };
  writeFileSync(join(media, 'tilt.depthv-0-2000.json'), JSON.stringify(meta));
  const asset = { id: 't', name: 'tilt.mp4', kind: 'video' as const, src: '/media/uploads/tilt.mp4', durationInFrames: frames, width: W, height: H };

  const stills = async (effects: ClipEffect[], at: number[]): Promise<Buffer[]> => {
    const clip = { id: 'c', track: 'V1', kind: 'video', name: 'tilt', src: asset.src, sourceAssetId: 't', durationInFrames: frames, width: W, height: H, effects, props: { rsDepthTrackSrc: '/media/uploads/tilt.depthv-0-2000.png' } };
    let h: History = { past: [], present: emptyProjectDoc(), future: [] };
    h = historyReduce(h, { type: 'addAsset', asset } as never);
    h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: W, height: H, fit: 'cover', fps: FPS }, { type: 'add', startFrame: 0, item: clip }] } as never);
    const tl = activeTimeline(h.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    try {
      const out = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames: at }) as Array<{ base64: string }>;
      return out.map((s) => execFileSync(ffmpegBin(), ['-v', 'error', '-i', 'pipe:0', '-vf', `scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'], { input: Buffer.from(s.base64, 'base64') }));
    } finally {
      await sub.cleanup();
    }
  };
  const band = (img: Buffer, y0: number, y1: number) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = Math.round(y0 * H); y < Math.round(y1 * H); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; sum[0]! += img[i]!; sum[1]! += img[i + 1]!; sum[2]! += img[i + 2]!; n++; }
    return sum.map((v) => v / n);
  };
  const diff = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]!), 0);
  // frame 6 (0.2 s: tiles 0 and 1, both with the low horizon) and frame 48 (1.6 s: tiles 3 and 4, the high one); a frame
  // between tiles 1 and 2 blends the two maps
  const at = [6, 48];
  // the GL path shifts colour a little against the plain video (see the GL colour note), so compare with strength 0
  const [base6, base48] = await stills([{ id: 'i', assetId: 'builtin:fx-invert', overrides: { intensity: 0 }, mix: { region: 'land' } } as ClipEffect], at);
  const [inv6, inv48] = await stills([{ id: 'i', assetId: 'builtin:fx-invert', mix: { region: 'land' } }], at);
  const mid = (img: Buffer) => band(img, 0.3, 0.45), top = (img: Buffer) => band(img, 0.03, 0.2), low = (img: Buffer) => band(img, 0.6, 0.95);
  const detail = `0.2 s: band ${mid(inv6!).map(Math.round)} (base ${mid(base6!).map(Math.round)}); 1.6 s: band ${mid(inv48!).map(Math.round)} (base ${mid(base48!).map(Math.round)})`;
  assert.ok(diff(mid(inv6!), mid(base6!)) < 12, `at 0.2 s the band is sky and stays (${detail})`);
  assert.ok(diff(mid(inv48!), mid(base48!)) > 200, `at 1.6 s the camera has tilted: the band is land and is inverted (${detail})`);
  assert.ok(diff(top(inv48!), top(base48!)) < 12 && diff(top(inv6!), top(base6!)) < 12, `the sky at the top stays (${detail})`);
  assert.ok(diff(low(inv6!), low(base6!)) > 200 && diff(low(inv48!), low(base48!)) > 200, `the land below is inverted (${detail})`);
  console.log(`skyTrackRender.verify: ok (${detail})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
