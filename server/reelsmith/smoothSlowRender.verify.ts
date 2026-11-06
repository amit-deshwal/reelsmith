// RS-1259 end to end: a clip slowed to 0.3x exports with each source frame repeated (the stutter); swapped for its smooth
// copy (smoothSlowClips → the browser client → the /api/reelsmith/smooth-slow route → smoothSlowSpan → the retime
// helper) it exports with a new picture on every frame, the same moment at the start, steady motion and its sound,
// through the real render pipeline the Player also plays.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import type { AtomicAction } from '../../src/editor/reducerActions.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline } from '../../src/editor/types.ts';
import { smoothSlowClips } from '../../src/reelsmith/agent/smoothSlowClips.ts';
import { createAnalyzeApi } from '../../src/reelsmith/analyzeApi.ts';
import { reelsmithAnalyzePlugin } from './analyze-plugin.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { registerMediaReference } from '../media-references.ts';
import { retimeHelper } from './retimeHelper.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimeline } from '../../remotion/render.mjs';

const helper = await retimeHelper();
if ('error' in helper) {
  console.log(`smoothSlowRender.verify: skipped (${helper.error})`);
  process.exit(0);
}

const W = 360, H = 640;
const work = mkdtempSync(join(tmpdir(), 'rs-smooth-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // 3 s at 30 fps: a white 60 px box moving right at 200 px/s (x = 40 + 200 t) over a dim test pattern, and a tone
  execFileSync(ffmpegBin(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=30:d=3,lutyuv=y=val*0.5:u=128:v=128`,
    '-f', 'lavfi', '-i', 'color=c=white:s=60x60:r=30:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-filter_complex', "[0][1]overlay=x='40+t*200':y=290:shortest=1,format=yuv420p[v]", '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-qp', '0', '-c:a', 'aac', '-b:a', '192k', join(media, 'box.mp4')]);
  const asset = { id: 'a0', name: 'box.mp4', kind: 'video' as const, src: '/media/uploads/box.mp4', durationInFrames: 90, width: W, height: H };
  // 2 s of reel showing 0.6 s of the clip from 0.5 s: a slow-motion moment at 0.3x
  const add = { type: 'add', startFrame: 0, item: { id: 'c', track: 'V1', kind: 'video', name: 'box', src: asset.src, sourceAssetId: 'a0', durationInFrames: 60, srcInFrame: 15, playbackRate: 0.3, width: W, height: H, volume: 1 } } as unknown as AtomicAction;

  const exportOf = async (clipAction: AtomicAction, name: string) => {
    let h: History = { past: [], present: emptyProjectDoc(), future: [] };
    h = historyReduce(h, { type: 'addAsset', asset } as never);
    h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: W, height: H, fit: 'cover' }, clipAction] } as never);
    const tl = activeTimeline(h.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: h.present.assets }, project: h.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    const out = join(work, name);
    try {
      await renderTimeline({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, outputLocation: out, codec: 'h264' });
    } finally {
      await sub.cleanup();
    }
    // the box's left edge on its middle row, frame by frame
    const gray = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    const frames = gray.length / (W * H);
    const xs = Array.from({ length: frames }, (_, k) => {
      const row = gray.subarray(k * W * H + 320 * W, k * W * H + 321 * W);
      return row.findIndex((v, x) => v >= 180 && (row[x + 30] ?? 0) >= 180);
    });
    // V10's frame difference: an exact repeat reads as 0
    const ydifText = spawnSync(ffmpegBin(), ['-nostats', '-i', out, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YDIF', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr;
    const ydif = [...ydifText.matchAll(/lavfi\.signalstats\.YDIF=([\d.]+)/g)].map((m) => Number(m[1])).slice(1);
    const pcm = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    const rms = (from: number, to: number) => Math.sqrt(samples.subarray(from, to).reduce((sum, v) => sum + v * v, 0) / Math.max(1, to - from));
    return { xs, ydif, seconds: samples.length / 48000, loud: [rms(0, samples.length / 2), rms(samples.length / 2, samples.length)] };
  };

  const slowed = await exportOf(add, 'slowed.mp4');
  // the app's path: the browser client's fetch answered by the analysis plugin's own route handlers, in process
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
  // the route answers a span that needs no in-between frames, and a file that is not there
  assert.deepEqual(await api.smoothSlow!('/media/uploads/box.mp4', 0.5, 0.5, 30, 15), { skipped: 'a 30 fps clip at 0.5x already has a new picture on every frame' });
  assert.match(JSON.stringify(await api.smoothSlow!('/media/uploads/nope.mp4', 0, 0.3, 30, 30)), /media not found: nope\.mp4/);
  const actions = [structuredClone(add)];
  const notes = await smoothSlowClips(actions, api, 30);
  assert.deepEqual(notes, []);
  assert.match(String((actions[0] as { item: { src: string } }).item.src), /box\.slow-500-300x60f30\.mp4$/);
  const smooth = await exportOf(actions[0]!, 'smooth.mp4');

  // A local import is stored by reference: its source file is outside uploads, but the returned copy must be there.
  const external = join(work, 'external');
  mkdirSync(external);
  copyFileSync(join(media, 'box.mp4'), join(external, 'referenced.mp4'));
  await registerMediaReference(media, 'imported.mp4', join(external, 'referenced.mp4'));
  const referenced = await api.smoothSlow!('/media/uploads/imported.mp4', 0.5, 0.3, 60, 30);
  assert.ok('src' in referenced && referenced.src);
  assert.ok(existsSync(join(media, 'imported.slow-500-300x60f30.mp4')), 'the copy is in the profile uploads under its imported name');
  assert.ok(!existsSync(join(external, 'referenced.slow-500-300x60f30.mp4')), 'the source folder is untouched');

  const steps = (xs: number[]) => xs.slice(1).map((x, k) => x - xs[k]!);
  assert.equal(slowed.xs.length, 60);
  assert.equal(smooth.xs.length, 60);
  assert.ok(slowed.xs.every((x) => x > 0) && smooth.xs.every((x) => x > 0), 'the box is found in every frame');
  // the slowed clip: the box stands still on two frames in three, then jumps
  const still = steps(slowed.xs).filter((d) => d === 0).length;
  assert.ok(still >= 30, `the slowed export repeats frames (${still} of 59 steps still)`);
  assert.ok(slowed.ydif.filter((d) => d < 0.05).length >= 30, 'V10 reads the repeats as zero difference');
  // the smooth copy: the same first moment, then 2 px on every frame (200 px/s at 0.3x over 30 fps)
  assert.ok(Math.abs(smooth.xs[0]! - slowed.xs[0]!) <= 2, `same first moment (x ${smooth.xs[0]} vs ${slowed.xs[0]})`);
  assert.ok(Math.abs(smooth.xs[0]! - 140) <= 2, `the copy starts where the clip did (x ${smooth.xs[0]}, expected 140)`);
  const moves = steps(smooth.xs);
  assert.ok(moves.every((d) => d >= 1 && d <= 4), `steady motion: ${moves.join(' ')}`);
  assert.ok(Math.abs(smooth.xs[59]! - (140 + 2 * 59)) <= 3, `ends where the clip ends (x ${smooth.xs[59]})`);
  assert.equal(smooth.ydif.filter((d) => d < 0.05).length, 0, `no repeated frames: ${smooth.ydif.map((d) => d.toFixed(2)).join(' ')}`);
  // its sound, slowed like the editor slows it, for the whole clip
  assert.ok(Math.abs(smooth.seconds - slowed.seconds) < 0.1, `sound as long as before (${smooth.seconds.toFixed(2)} vs ${slowed.seconds.toFixed(2)} s)`);
  assert.ok(smooth.loud[0]! > 1000 && smooth.loud[1]! > 1000, `sound all through (${smooth.loud.map((v) => v.toFixed(0)).join(', ')})`);
  console.log(`smoothSlowRender.verify: ok (slowed: ${still}/59 still steps; smooth: steps ${Math.min(...moves)}-${Math.max(...moves)} px)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
