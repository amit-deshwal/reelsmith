import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../media-binaries.ts';
import { frameScores, scoreFrame } from './frameScore.ts';
import { reelsmithAnalyzePlugin } from './analyze-plugin.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { deliverCover } from '../../src/reelsmith/exportCover.ts';

// RS-1234: a cover wants a sharp subject with a calm band for the title, not the busiest frame
const W = 72, H = 128;
const rgbOf = (px: (x: number, y: number) => [number, number, number]) => {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) out.set(px(x, y), (y * W + x) * 3);
  return out;
};
const noise = (x: number, y: number) => ((x * 7919 + y * 104729) % 97) / 97;
// blue sky over the top half, a detailed green-and-red subject below
const hero = rgbOf((x, y) => (y < H / 2 ? [120, 170, 230] : [60 + 120 * noise(x, y), 140 + 80 * noise(y, x), 40 + 60 * noise(x + 3, y)]));
// detail and colour everywhere (an arcade, a crowd)
const busy = rgbOf((x, y) => [255 * noise(x, y), 255 * noise(y, x), 255 * noise(x + 5, y + 2)]);
// a flat grey frame (a fade, a blurry foreground)
const flat = rgbOf(() => [128, 128, 128]);
// the hero frame darkened to near black
const dark = rgbOf((x, y) => (y < H / 2 ? [12, 14, 20] : [6 + 10 * noise(x, y), 10, 6]));

const s = { hero: scoreFrame(hero, W, H), busy: scoreFrame(busy, W, H), flat: scoreFrame(flat, W, H), dark: scoreFrame(dark, W, H) };
assert.ok(s.hero.score > s.busy.score + 0.2, `hero ${JSON.stringify(s.hero)} beats busy ${JSON.stringify(s.busy)}`);
assert.ok(s.hero.clean > 0.8 && s.busy.clean < 0.4, 'the sky is the clean band; a busy frame has none');
assert.equal(s.flat.score, 0, 'nothing sharp, no cover');
assert.ok(s.dark.score < s.hero.score / 2, `dark ${s.dark.score}`);
assert.deepEqual(scoreFrame([], 0, 0).score, 0);

// on a real file: a frame read by ffmpeg scores; a moment past the end scores 0 instead of throwing
const dir = mkdtempSync(join(tmpdir(), 'rs-frame-score-'));
try {
  const media = join(dir, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  // 1 s of test pattern, then 1 s of flat grey
  const file = join(media, 'clip.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=1', '-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=30:d=1',
    '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', file]);
  const [inside, grey, past] = await frameScores(file, [0.5, 1.5, 9]);
  assert.ok(inside!.score > 0 && inside!.sharp > 0, JSON.stringify(inside));
  assert.equal(grey!.score, 0);
  assert.equal(past!.score, 0);

  // the app's path: deliverCover asks the analysis plugin's own routes (in process) and takes the frame they score best
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => unknown>();
  (reelsmithAnalyzePlugin() as unknown as { configureServer: (server: unknown) => void }).configureServer({
    middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => unknown) => routes.set(path, handler) },
    config: { logger: { error: () => undefined } },
  });
  const asked: Array<{ path: string; body: unknown }> = [];
  const fetcher = (async (path: string, init?: { method?: string; body?: string }) => {
    asked.push({ path, body: JSON.parse(init?.body ?? '{}') });
    const handler = routes.get(path);
    if (!handler) return new Response('{}', { status: 404 });
    const req = Object.assign(Readable.from([Buffer.from(init?.body ?? '{}')]), { method: init?.method ?? 'POST' });
    const reply = await new Promise<{ status: number; text: string }>((done) => {
      const res = { statusCode: 200, setHeader: () => undefined, end(text: string) { done({ status: this.statusCode, text }); } };
      void handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    });
    return new Response(reply.text, { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  // two shots: the grey second (longest, the old fixed pick) and the pattern first
  const shot = (from: number, to: number, id: string) => ({ id, track: 'V1', kind: 'video', startFrame: from * 30, durationInFrames: (to - from) * 30, name: id }) as never;
  let drawnB64 = '';
  const out = await deliverCover({
    state: { fps: 30, items: [shot(0, 0.9, 'a'), shot(0.9, 2, 'b')] }, src: '/media/uploads/clip.mp4', seconds: 2, videoName: 'clip.mp4',
    write: async () => {}, fetcher, draw: async (b64) => { drawnB64 = b64; return new Blob(['x']); },
  });
  assert.equal(out.status, 'written', JSON.stringify(out));
  assert.ok(out.status === 'written' && out.pick.atSec < 0.9, `the pattern shot, not the grey one: ${JSON.stringify(out)}`);
  assert.deepEqual(asked.map((a) => a.path), ['/api/reelsmith/frame-scores', '/api/reelsmith/frame-jpeg']);
  assert.ok(Buffer.from(drawnB64, 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8])), 'a JPEG of the export frame');
  // the route refuses a request with no times and a file that is not there; the cover then falls back, never throws
  const bad = await fetcher('/api/reelsmith/frame-scores', { method: 'POST', body: JSON.stringify({ src: '/media/uploads/clip.mp4', times: [] }) });
  assert.notEqual(bad.status, 200);
  const missing = await deliverCover({ state: { fps: 30, items: [] }, src: '/media/uploads/nope.mp4', seconds: 2, videoName: 'n.mp4', write: async () => {}, fetcher });
  assert.equal(missing.status, 'failed');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('frameScore.verify ok');
