// RS-1238: the depth sidecar. Pure checks always; a real photo through the model when the depth-lite pack is installed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { depthMapFor, depthName, depthPackInstalled } from './depthMap.ts';
import { boxMean, depthToGray, guidedFilterRgb, normalizeDepth } from './depthMath.ts';
import { ffmpegBin } from '../media-binaries.ts';

assert.equal(depthName('/m/IMG_1.jpg'), 'IMG_1.depth.png');
assert.equal(depthName('/m/trail.mp4', 1.5), 'trail.depth-1500.png');

// percentile stretch: one outlier does not flatten the rest
const raw = Float32Array.from({ length: 100 }, (_, i) => i);
raw[99] = 10_000;
const norm = normalizeDepth(raw);
assert.ok(norm[50]! > 0.45 && norm[50]! < 0.55, `middle ${norm[50]}`);
assert.equal(norm[99], 1);
assert.deepEqual([...boxMean(Float32Array.of(0, 0, 3, 3), 4, 1, 1)].map((v) => Math.round(v * 100) / 100), [0, 1, 2, 3]);

// a soft, misplaced depth edge snaps to the photo's colour edge, even between colours of the same brightness
// (green at x < 40, turquoise of about the same brightness at x >= 40; the model's edge is blurred and a few pixels off,
// around x = 44, as at the map's 1036 px output size)
const W = 80, H = 20;
const rgb = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(x < 40 ? [40, 160, 40] : [20, 120, 170], (y * W + x) * 3);
const soft = Float32Array.from({ length: W * H }, (_, i) => 1 / (1 + Math.exp(((i % W) - 44) / 2.5)));
const plainMap = depthToGray(soft, W, H);
const snapped = depthToGray(soft, W, H, { guide: rgb, radius: 8, eps: 1e-3 });
const row = (m: Uint8Array) => Array.from({ length: W }, (_, x) => m[10 * W + x]!);
const edgeAt = (r: number[]) => r.findIndex((v) => v < 128);
assert.ok(edgeAt(row(plainMap)) >= 43, `model edge ${edgeAt(row(plainMap))}`);
assert.ok(Math.abs(edgeAt(row(snapped)) - 40) <= 1, `snapped edge ${edgeAt(row(snapped))}`);
// inside each region the map stays flat (no texture copied in)
const r = row(snapped);
assert.ok(Math.max(...r.slice(5, 34)) - Math.min(...r.slice(5, 34)) < 30 && Math.max(...r.slice(56, 75)) < 60);
// the colour guide keeps the edge; a flat guide leaves the map as it was
const flat = guidedFilterRgb(new Float32Array(W * H * 3).fill(0.5), soft, W, H, 6, 1e-3);
assert.ok(Math.abs(flat[10 * W + 44]! - soft[10 * W + 44]!) < 0.1);
// grow: near values spread outwards
const grown = depthToGray(Float32Array.from({ length: 9 }, (_, i) => (i === 4 ? 1 : 0)), 3, 3, { grow: 1 });
assert.ok(grown.every((v) => v === 255));

if (!depthPackInstalled()) {
  console.log('depthMap.verify: ok (pure checks; the depth-lite pack is not installed, so no model run)');
} else {
  const dir = mkdtempSync(join(tmpdir(), 'rs-depth-'));
  try {
    // a landscape: sky on top, ground rising towards the camera, a dark near "rock" bottom left
    const photo = join(dir, 'view.jpg');
    execFileSync(ffmpegBin(), ['-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=960x640:c0=0x87ceeb:c1=0x2e6b2e:x0=0:y0=0:x1=0:y1=640,format=rgb24',
      '-vf', 'drawbox=x=0:y=380:w=380:h=260:color=0x3a3a3a:t=fill', '-frames:v', '1', photo]);
    const first = await depthMapFor(photo);
    assert.equal(first.name, 'view.depth.png');
    assert.equal(first.cached, false);
    assert.equal(first.height, 1036);
    assert.equal(first.width, Math.round(1036 * 960 / 640));
    const out = join(dir, first.name);
    assert.ok(existsSync(out));
    // near (bottom) is brighter than far (top)
    const px = (x: number, y: number) => execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vf', `crop=1:1:${x}:${y},format=gray`, '-f', 'rawvideo', '-'])[0]!;
    assert.ok(px(1200, 1000) > px(800, 40) + 40, `near ${px(1200, 1000)} far ${px(800, 40)}`);
    // made once: the second call reuses it while it is newer than the photo
    const again = await depthMapFor(photo);
    assert.equal(again.cached, true);
    const later = new Date(statSync(out).mtimeMs + 5000);
    utimesSync(photo, later, later);
    assert.equal((await depthMapFor(photo)).cached, false);
    console.log('depthMap.verify: ok (model run on a test photo)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
