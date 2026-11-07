// RS-1259 follow-up: a sped-up clip with the motion-blur effect (velocity's fast parts) is swapped for a copy blurred
// along its motion: smoothSlowClips → the browser client → the /api/reelsmith/motion-blur route → motionBlurSpan → the
// retime helper's --blur mode (Apple's VTMotionBlur). On a camera pan at 3x the copy shows the same frames the clip
// showed, with edges smeared along the pan, and the fixed-direction effect comes off.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { AtomicAction } from '../../src/editor/reducerActions.ts';
import { smoothedFrom, smoothSlowClips } from '../../src/reelsmith/agent/smoothSlowClips.ts';
import { createAnalyzeApi } from '../../src/reelsmith/analyzeApi.ts';
import { reelsmithAnalyzePlugin } from './analyze-plugin.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { retimeHelper } from './retimeHelper.ts';

const helper = await retimeHelper();
if ('error' in helper || !helper.blur) {
  console.log(`motionBlurCopy.verify: skipped (${'error' in helper ? helper.error : 'no motion blur on this Mac'})`);
  process.exit(0);
}

const W = 360, H = 640;
const work = mkdtempSync(join(tmpdir(), 'rs-motion-blur-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // 4 s at 30 fps: the camera pans right over a wide test pattern at 120 px/s (4 px a source frame, 12 at 3x)
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1600x640:r=30:d=4', '-vf', `crop=${W}:${H}:'t*120':0,format=yuv420p`,
    '-c:v', 'libx264', '-qp', '0', join(media, 'pan.mp4')]);

  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => unknown>();
  (reelsmithAnalyzePlugin() as unknown as { configureServer: (server: unknown) => void }).configureServer({
    middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => unknown) => routes.set(path, handler) },
    config: { logger: { error: () => undefined } },
  });
  const fetcher = (async (path: string, init?: { method?: string; body?: string }) => {
    const handler = routes.get(path);
    if (!handler) return new Response('{}', { status: 404 });
    const req = Object.assign(Readable.from([Buffer.from(init?.body ?? '{}')]), { method: init?.method ?? 'GET' });
    const reply = await new Promise<{ status: number; text: string }>((done) => {
      const res = { statusCode: 200, setHeader: () => undefined, end(text: string) { done({ status: this.statusCode, text }); } };
      void handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    });
    return new Response(reply.text, { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  const api = createAnalyzeApi(fetcher);
  assert.deepEqual(await api.motionBlur!('/media/uploads/pan.mp4', 0, 0.5, 30, 30, 50), { skipped: 'motion blur is for a sped-up clip' });

  // 20 reel frames from 0.5 s at 3x, with velocity's effect (amount (3 - 1) * 2.4)
  const effects = [{ id: 'grade', assetId: 'builtin:fx-vignette' }, { id: 'blur', assetId: 'builtin:fx-motion-blur', overrides: { amount: 4.8 } }];
  const actions = [{ type: 'add', startFrame: 0, item: { id: 'c', track: 'V1', kind: 'video', name: 'pan', src: '/media/uploads/pan.mp4', sourceAssetId: 'a0', durationInFrames: 20, srcInFrame: 15, playbackRate: 3, width: W, height: H, volume: 0, effects } }] as unknown as AtomicAction[];
  const progress: string[] = [];
  assert.deepEqual(await smoothSlowClips(actions, api, 30, (m) => progress.push(m)), []);
  assert.deepEqual(progress, ['Blurring the fast parts (1 clip)']);
  const item = (actions[0] as Extract<AtomicAction, { type: 'add' }>).item;
  assert.match(String(item.src), /pan\.blur-500-3000x20f30s58\.mp4$/);
  assert.equal(item.playbackRate, undefined);
  assert.equal(item.srcInFrame, 0);
  assert.deepEqual(item.effects?.map((e) => e.assetId), ['builtin:fx-vignette'], 'the fixed-direction blur comes off, the rest stays');
  assert.deepEqual({ ...smoothedFrom(item as never), sourceRevision: undefined }, { src: '/media/uploads/pan.mp4', srcInFrame: 15, playbackRate: 3, width: W, height: H, assetId: 'a0', motionBlur: 4.8, sourceRevision: undefined, sourceContentHash: undefined, sourceSize: undefined, sourceModifiedAt: undefined, sourceFilename: undefined, originalFilePath: undefined });

  // red channel along a row, frame by frame
  const reds = (file: string) => {
    const rgb = execFileSync(ffmpegBin(), ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
    return (k: number, y: number) => Array.from({ length: W }, (_, x) => rgb[(k * W * H + y * W + x) * 3]!);
  };
  // the red-to-green edge of the pattern: where it is, and how many pixels the change takes
  const edge = (row: number[]) => {
    const hi = Math.max(...row.slice(0, 40)), lo = Math.min(...row.slice(40, 200));
    const at = row.findIndex((v, x) => x > 0 && v < (hi + lo) / 2);
    const width = row.filter((v, x) => x < 200 && v < lo + (hi - lo) * 0.9 && v > lo + (hi - lo) * 0.1).length;
    return { at, width };
  };
  const plain = reds(join(media, 'pan.mp4'));
  const blurred = reds(join(media, decodeURIComponent(String(item.src).split('/').pop()!)));
  const widths: number[] = [];
  for (const k of [4, 8, 12]) {
    // frame k of the copy is source frame 15 + 3k
    const p = edge(plain(15 + 3 * k, 100)), b = edge(blurred(k, 100));
    assert.ok(Math.abs(b.at - p.at) <= 4, `frame ${k}: the edge is where the clip showed it (${b.at} vs ${p.at})`);
    assert.ok(p.width <= 2, `the source edge is sharp (${p.width} px)`);
    assert.ok(b.width >= 4, `frame ${k}: the copy smears it across the pan (${b.width} px)`);
    widths.push(b.width);
  }
  console.log(`motionBlurCopy.verify: ok (edge ${widths.join('/')} px wide in the copy, 1-2 in the source)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
