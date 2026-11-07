// RS-1259 follow-up end to end: a talking clip cut into two pieces with a small jump (the box leaps 16 px between two
// frames, where it moves 4 a frame; a head between two phrases moves about this much) exports with the leap; with its smooth cut (smoothCutActions → the browser client → /api/reelsmith/smooth-cut
// → smoothCutSpan → the retime helper's --pair mode) the export walks the box across in small steps instead, the
// frames outside the overlay are the pieces' own, and the sound is the same.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { emptyProjectDoc } from '../../src/app/appShell.ts';
import type { AtomicAction } from '../../src/editor/reducerActions.ts';
import { historyReduce, type History } from '../../src/editor/reduce.ts';
import { activeTimeline } from '../../src/editor/types.ts';
import { createAnalyzeApi } from '../../src/reelsmith/analyzeApi.ts';
import { smoothCutActions } from '../../src/reelsmith/smoothCuts.ts';
import { reelsmithAnalyzePlugin } from './analyze-plugin.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { retimeHelper } from './retimeHelper.ts';
// @ts-expect-error — plain .mjs render pipeline has no .d.ts
import { renderTimeline } from '../../remotion/render.mjs';

const helper = await retimeHelper();
if ('error' in helper) {
  console.log(`smoothCutRender.verify: skipped (${helper.error})`);
  process.exit(0);
}

const W = 360, H = 640;
const work = mkdtempSync(join(tmpdir(), 'rs-smooth-cut-render-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // 3 s at 30 fps: a white box moving right 4 px a frame over a dim test pattern, and a tone
  execFileSync(ffmpegBin(), ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=30:d=3,lutyuv=y=val*0.5:u=128:v=128`,
    '-f', 'lavfi', '-i', 'color=c=white:s=60x60:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-filter_complex', "[0][1]overlay=x='20+t*120':y=290:shortest=1,format=yuv420p[v]", '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-qp', '0', '-c:a', 'aac', '-b:a', '192k', join(media, 'talk.mp4')]);
  const asset = { id: 'a0', name: 'talk.mp4', kind: 'video' as const, src: '/media/uploads/talk.mp4', durationInFrames: 90, width: W, height: H };
  // source frames 0-12, then 16-42: a 3-frame jump at reel frame 13 (the morph runs from source frame 10 to 18;
  // Apple's model is not always linear in between, e.g. 17 to 25 here steps 6 19 6 0, so the check uses a span it walks evenly)
  const piece = (id: string, at: number, srcIn: number, frames: number) => ({ type: 'add', startFrame: at, item: { id, track: 'V1', kind: 'video', name: 'talk', src: asset.src, sourceAssetId: 'a0', durationInFrames: frames, srcInFrame: srcIn, width: W, height: H, volume: 1 } }) as unknown as AtomicAction;
  const pieces = [piece('p1', 0, 0, 13), piece('p2', 13, 16, 27)];

  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'addAsset', asset } as never);
  h = historyReduce(h, { type: 'batch', label: 'setup', actions: [{ type: 'setCanvas', width: W, height: H, fit: 'cover' }, ...pieces] } as never);
  const exportOf = async (doc: History, name: string) => {
    const tl = activeTimeline(doc.present);
    const sub = await acceptExportSubmission({ state: { ...tl, assets: doc.present.assets }, project: doc.present, timelineId: tl.id, format: 'video', codec: 'h264' } as never);
    const out = join(work, name);
    try {
      await renderTimeline({ state: sub.plan.state, project: sub.plan.project, timelineId: sub.plan.timelineId, outputLocation: out, codec: 'h264' });
    } finally {
      await sub.cleanup();
    }
    const gray = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
    const xs = Array.from({ length: gray.length / (W * H) }, (_, k) => {
      const row = gray.subarray(k * W * H + 320 * W, k * W * H + 321 * W);
      return row.findIndex((v, x) => v >= 180 && (row[x + 30] ?? 0) >= 180);
    });
    const pcm = execFileSync(ffmpegBin(), ['-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
    return { xs, pcm };
  };
  const hard = await exportOf(h, 'hard.mp4');

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
  let n = 0;
  const made = await smoothCutActions(activeTimeline(h.present), createAnalyzeApi(fetcher), () => `o${++n}`);
  assert.deepEqual(made.notes, []);
  assert.equal(made.made, 1);
  const smoothDoc = historyReduce(h, { type: 'batch', label: 'smooth cut', actions: made.actions } as never);
  const smooth = await exportOf(smoothDoc, 'smooth.mp4');

  const steps = (xs: number[]) => xs.slice(1).map((x, k) => x - xs[k]!);
  assert.equal(hard.xs.length, 40);
  assert.equal(smooth.xs.length, 40);
  assert.ok(hard.xs.every((x) => x > 0), `the box is in every hard-cut frame: ${hard.xs.join(' ')}`);
  // the hard cut: 4 px a frame, then the leap at frame 20
  assert.ok(steps(hard.xs)[12]! >= 15, `the leap: ${steps(hard.xs)[12]} px`);
  // smoothed: the frames outside the overlay (11-14) are the pieces' own; inside, the box goes on in small steps
  for (const k of [...Array(11).keys(), ...Array.from({ length: 25 }, (_, i) => 15 + i)]) assert.ok(Math.abs(smooth.xs[k]! - hard.xs[k]!) <= 1, `frame ${k} unchanged (${smooth.xs[k]} vs ${hard.xs[k]})`);
  const across = smooth.xs.slice(10, 16);
  assert.ok(across.every((x) => x > 0), `the box is found across the cut: ${across.join(' ')}`);
  const walk = steps(across);
  assert.ok(walk.every((d) => d > 0 && d <= 9), `small steps across the cut instead of one ${steps(hard.xs)[12]} px leap: ${walk.join(' ')}`);
  // the overlay is muted: the sound is the pieces' own
  const diff = hard.pcm.length === smooth.pcm.length ? hard.pcm.reduce((m, v, i) => Math.max(m, Math.abs(v - smooth.pcm[i]!)), 0) : -1;
  assert.ok(diff >= 0 && diff <= 2, `same sound (byte diff ${diff})`);
  console.log(`smoothCutRender.verify: ok (hard ${hard.xs.slice(10, 16).join(' ')}; smooth ${across.join(' ')})`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
