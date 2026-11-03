// RS-1260, rendered: lens blur, its focus pull, depth haze and relight through the export renderer, reading a depth
// track (atlas and index written by hand) beside a video. The video: a fine grey checker far behind, and a "person", a
// red checker box with a rounded (dome) depth, that walks from left to right; the track's tiles follow it, so an effect
// that read the wrong tile would blur the box or leave its old place sharp.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type ClipEffect } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { trackLayout, type DepthTrackMeta } from '../../shared/reelsmith/depthTrack.ts';
import { loadSharp } from './depthMap.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';

const W = 360, H = 640, FPS = 30, SEC = 2;
const BOX = { w: 100, h: 220, y: 260 };
const boxX = (t: number) => Math.round(40 + (t / SEC) * 180);
/** the box's depth at a column (a dome: 0.85 in the middle, 0.72 at its sides), the far wall 0.1 */
const domeAt = (x: number, x0: number) => 0.72 + 0.13 * (1 - ((x - x0 - BOX.w / 2) / (BOX.w / 2)) ** 2);
const inBox = (x: number, y: number, x0: number) => x >= x0 && x < x0 + BOX.w && y >= BOX.y && y < BOX.y + BOX.h;

const work = mkdtempSync(join(tmpdir(), 'rs-depth-track-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // the video
  const frames = FPS * SEC;
  const raw = Buffer.alloc(W * H * 3 * frames);
  for (let f = 0; f < frames; f++) {
    const x0 = boxX(f / FPS);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((f * H + y) * W + x) * 3;
      if (inBox(x, y, x0)) { const c = ((x >> 3) + (y >> 3)) & 1 ? 230 : 120; raw[i] = c; raw[i + 1] = c * 0.35; raw[i + 2] = c * 0.3; } else { const c = ((x >> 2) + (y >> 2)) & 1 ? 200 : 60; raw[i] = c; raw[i + 1] = c; raw[i + 2] = c; }
    }
  }
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0', '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv420p', join(media, 'walk.mp4')], { input: raw });
  // its depth track, as the server lays it out
  const layout = trackLayout(0, SEC, W, H);
  assert.equal(layout.tileWidth, W);
  const atlasW = layout.cols * W, atlasH = layout.rows * H;
  const atlas = Buffer.alloc(atlasW * atlasH);
  for (let k = 0; k < layout.count; k++) {
    const x0 = boxX(k * layout.step), ox = (k % layout.cols) * W, oy = Math.floor(k / layout.cols) * H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) atlas[(oy + y) * atlasW + ox + x] = Math.round(255 * (inBox(x, y, x0) ? domeAt(x, x0) : 0.1));
  }
  const sharp = await loadSharp();
  await sharp(atlas, { raw: { width: atlasW, height: atlasH, channels: 1 } }).png().toFile(join(media, 'walk.depthv-0-2000.png'));
  const meta: DepthTrackMeta = { version: 1, fromSec: 0, step: layout.step, count: layout.count, cols: layout.cols, rows: layout.rows, tileWidth: W, tileHeight: H, subject: Array.from({ length: layout.count }, () => 0.82) };
  writeFileSync(join(media, 'walk.depthv-0-2000.json'), JSON.stringify(meta));
  const asset = { id: 'w', name: 'walk.mp4', kind: 'video' as const, src: '/media/uploads/walk.mp4', durationInFrames: frames, width: W, height: H };

  const stills = async (effects: ClipEffect[], at: number[]): Promise<Buffer[]> => {
    const clip = { id: 'c', track: 'V1', kind: 'video', name: 'walk', src: asset.src, sourceAssetId: 'w', durationInFrames: frames, width: W, height: H, effects, props: { rsDepthTrackSrc: '/media/uploads/walk.depthv-0-2000.png' } };
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
  // detail: mean absolute difference between horizontal neighbours (green channel) over a region
  const detail = (img: Buffer, x0: number, x1: number, y0: number, y1: number) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1 - 1; x++) { s += Math.abs(img[(y * W + x + 1) * 3]! - img[(y * W + x) * 3]!); n++; }
    return s / n;
  };
  const mean = (img: Buffer, x0: number, x1: number, y0: number, y1: number) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; s += img[i]! + img[i + 1]! + img[i + 2]!; n++; }
    return s / n / 3;
  };
  // the box's inside (away from its edges) and the wall above it, at frame f
  const boxIn = (f: number): [number, number, number, number] => { const x0 = boxX(f / FPS); return [x0 + 14, x0 + BOX.w - 14, BOX.y + 14, BOX.y + BOX.h - 14]; };
  const wall: [number, number, number, number] = [20, W - 20, 30, 200];
  const F = [15, 45]; // 0.5 s and 1.5 s
  const plain = await stills([], F);
  const blur = await stills([{ id: 'b', assetId: 'builtin:fx-lens-blur', overrides: { blur: 0.02 } }], F);
  const pull = await stills([{ id: 'p', assetId: 'builtin:fx-lens-blur', overrides: { blur: 0.02, pullTo: 0.1, at: 0.9, pullTime: 0.3 } }], F);
  const haze = await stills([{ id: 'h', assetId: 'builtin:fx-depth-haze', overrides: { density: 2, drift: 0, auto: 0 } }], [F[0]!]);
  const light = await stills([{ id: 'r', assetId: 'builtin:fx-relight', overrides: { strength: 1, from: 180, to: 180, at: 0, sweep: 0.2 } }], [F[1]!]);
  const report: string[] = [];
  for (const [k, f] of F.entries()) {
    const b = boxIn(f);
    const dPlain = [detail(plain[k]!, ...b), detail(plain[k]!, ...wall)];
    const dBlur = [detail(blur[k]!, ...b), detail(blur[k]!, ...wall)];
    const dPull = [detail(pull[k]!, ...b), detail(pull[k]!, ...wall)];
    report.push(`f${f} box/wall detail plain ${dPlain.map(Math.round)} blur ${dBlur.map(Math.round)} pull ${dPull.map(Math.round)}`);
    // the moving box stays sharp where it is at this frame (its tile was read), the far wall goes soft
    assert.ok(dBlur[0]! > dPlain[0]! * 0.85, `lens blur keeps the box sharp at frame ${f} (${report.join('; ')})`);
    assert.ok(dBlur[1]! < dPlain[1]! * 0.35, `and blurs the wall (${report.join('; ')})`);
  }
  // the pull: before it the box is sharp and the wall soft; after it the wall is sharp and the box soft
  const [b0, b1] = [boxIn(F[0]!), boxIn(F[1]!)];
  assert.ok(detail(pull[0]!, ...b0) > detail(plain[0]!, ...b0) * 0.85 && detail(pull[0]!, ...wall) < detail(plain[0]!, ...wall) * 0.35, `before the pull the focus is on the box (${report.join('; ')})`);
  assert.ok(detail(pull[1]!, ...wall) > detail(plain[1]!, ...wall) * 0.85 && detail(pull[1]!, ...b1) < detail(plain[1]!, ...b1) * 0.6, `after it on the wall (${report.join('; ')})`);
  // haze: the wall lifts toward the haze colour, the box is left alone
  const hb = boxIn(F[0]!);
  report.push(`haze wall ${Math.round(mean(plain[0]!, ...wall))}->${Math.round(mean(haze[0]!, ...wall))} detail ${Math.round(detail(plain[0]!, ...wall))}->${Math.round(detail(haze[0]!, ...wall))}, box ${Math.round(mean(plain[0]!, ...hb))}->${Math.round(mean(haze[0]!, ...hb))}`);
  assert.ok(detail(haze[0]!, ...wall) < detail(plain[0]!, ...wall) * 0.5, `depth haze flattens the far wall (${report.join('; ')})`);
  assert.ok(Math.abs(mean(haze[0]!, ...hb) - mean(plain[0]!, ...hb)) < 4, `and leaves the near box (${report.join('; ')})`);
  // relight from the left: the box's left side brighter than before, its right side darker, the wall as it was
  const x0 = boxX(F[1]! / FPS);
  const left: [number, number, number, number] = [x0 + 6, x0 + 30, BOX.y + 20, BOX.y + BOX.h - 20];
  const right: [number, number, number, number] = [x0 + BOX.w - 30, x0 + BOX.w - 6, BOX.y + 20, BOX.y + BOX.h - 20];
  const lp = mean(plain[1]!, ...left), ll = mean(light[0]!, ...left), rp = mean(plain[1]!, ...right), rl = mean(light[0]!, ...right);
  const wp = mean(plain[1]!, ...wall), wl = mean(light[0]!, ...wall);
  report.push(`relight left ${Math.round(lp)}->${Math.round(ll)} right ${Math.round(rp)}->${Math.round(rl)} wall ${Math.round(wp)}->${Math.round(wl)}`);
  assert.ok(ll > lp * 1.08 && rl < rp * 0.97, `relight lights the side facing the light (${report.join('; ')})`);
  assert.ok(Math.abs(wl - wp) < 2, `and leaves the far wall (${report.join('; ')})`);
  console.log(`depthTrackRender.verify: ok (${report.join('; ')})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
