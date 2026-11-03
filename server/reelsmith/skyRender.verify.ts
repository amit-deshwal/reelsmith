// RS-1261, rendered: an effect kept to the land changes the land and leaves the sky as it was, and Sky recover changes only
// the sky, through the export renderer with a real sky map beside the clip's depth map. A photo: blue sky over the top half,
// green land below; its depth map and sky map written by hand (white = near / white = sky).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline, type ClipEffect } from '../../src/editor/types.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimelineStills } from '../../remotion/render.mjs';

const W = 360, H = 640, FRAME = 10;
const work = mkdtempSync(join(tmpdir(), 'rs-sky-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  const ff = (args: string[]) => execFileSync(ffmpegBin(), ['-v', 'error', '-y', ...args]);
  // the photo, its depth map (sky far, land near) and its sky map (the top half)
  ff(['-f', 'lavfi', '-i', `color=c=0x6aa0e0:s=${W}x${H / 2}`, '-f', 'lavfi', '-i', `color=c=0x4a8a3a:s=${W}x${H / 2}`, '-filter_complex', '[0][1]vstack', '-frames:v', '1', join(media, 'view.png')]);
  ff(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H / 2}`, '-f', 'lavfi', '-i', `color=c=0xc0c0c0:s=${W}x${H / 2}`, '-filter_complex', '[0][1]vstack,format=gray', '-frames:v', '1', join(media, 'view.depth.png')]);
  ff(['-f', 'lavfi', '-i', `color=c=white:s=${W}x${H / 2}`, '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H / 2}`, '-filter_complex', '[0][1]vstack,format=gray', '-frames:v', '1', join(media, 'view.depth.sky.png')]);
  const asset = { id: 'v', name: 'view.png', kind: 'image' as const, src: '/media/uploads/view.png', durationInFrames: 60, width: W, height: H };

  const still = async (effects: ClipEffect[]): Promise<Buffer> => {
    const photo = { id: 'p', track: 'V1', kind: 'image', name: 'view', src: asset.src, sourceAssetId: 'v', durationInFrames: 60, width: W, height: H, effects, props: { rsDepthSrc: '/media/uploads/view.depth.png' } };
    let h: History = { past: [], present: emptyProjectDoc(), future: [] };
    h = historyReduce(h, { type: 'addAsset', asset } as never);
    h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: W, height: H, fit: 'cover' }, { type: 'add', startFrame: 0, item: photo }] } as never);
    const tl = activeTimeline(h.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    try {
      const [s] = await renderTimelineStills({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, frames: [FRAME] }) as Array<{ base64: string }>;
      return execFileSync(ffmpegBin(), ['-v', 'error', '-i', 'pipe:0', '-vf', `scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'], { input: Buffer.from(s!.base64, 'base64') });
    } finally {
      await sub.cleanup();
    }
  };
  // mean colour of a band of rows (away from the horizon's soft edge)
  const band = (img: Buffer, y0: number, y1: number) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = Math.round(y0 * H); y < Math.round(y1 * H); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; sum[0]! += img[i]!; sum[1]! += img[i + 1]!; sum[2]! += img[i + 2]!; n++; }
    return sum.map((v) => v / n);
  };
  const diff = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]!), 0);
  const plain = await still([]);
  const land = await still([{ id: 'i', assetId: 'builtin:fx-invert', mix: { region: 'land' } }]);
  const recover = await still([{ id: 'r', assetId: 'builtin:fx-sky-recover', overrides: { strength: 1 } }]);
  const sky = (img: Buffer) => band(img, 0.05, 0.4), ground = (img: Buffer) => band(img, 0.6, 0.95);
  const report = (name: string, img: Buffer) => `${name}: sky ${sky(img).map(Math.round)} land ${ground(img).map(Math.round)}`;
  const detail = [report('plain', plain), report('land-only invert', land), report('sky recover', recover)].join('; ');
  assert.ok(diff(sky(land), sky(plain)) < 12, `a land-only effect leaves the sky (${detail})`);
  assert.ok(diff(ground(land), ground(plain)) > 200, `and changes the land (${detail})`);
  assert.ok(diff(sky(recover), sky(plain)) > 30, `Sky recover changes the sky (${detail})`);
  assert.ok(diff(ground(recover), ground(plain)) < 12, `and leaves the land (${detail})`);
  console.log(`skyRender.verify: ok (${detail})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
