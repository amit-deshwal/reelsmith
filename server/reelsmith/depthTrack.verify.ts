// RS-1260: the depth track route, in process, from the browser client (withDepthMap) through the analysis plugin's
// handler to the depth model: a video span becomes an atlas and its index next to the source, made once.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { TimelineItem } from '../../src/editor/types.ts';
import { withDepthMap } from '../../src/reelsmith/depthMaps.ts';
import { depthTrackMetaName, parseDepthTrackMeta } from '../../shared/reelsmith/depthTrack.ts';
import { reelsmithAnalyzePlugin } from './analyze-plugin.ts';
import { setUploadsDirProvider } from '../plugins/export-rendering.ts';
import { seedKeystore } from '../keystore.ts';
import { ffmpegBin } from '../media-binaries.ts';
import { depthPackInstalled, loadSharp } from './depthMap.ts';
import { depthTrackName } from './depthTrack.ts';

assert.equal(depthTrackName('/x/IMG_8693.MOV', 2, 6.0004), 'IMG_8693.depthv-2000-6000.png');
assert.equal(depthTrackMetaName('/media/uploads/a.depthv-0-1000.png'), '/media/uploads/a.depthv-0-1000.json');

const work = mkdtempSync(join(tmpdir(), 'rs-depth-track-'));
try {
  const media = join(work, 'media');
  mkdirSync(media);
  setUploadsDirProvider(() => media);
  seedKeystore({ MEDIA_DIR: media });
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => unknown>();
  (reelsmithAnalyzePlugin() as unknown as { configureServer: (server: unknown) => void }).configureServer({
    middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => unknown) => routes.set(path, handler) },
    config: { logger: { error: () => undefined } },
  });
  const fetcher = async (path: string, init: RequestInit) => {
    const handler = routes.get(path);
    if (!handler) return new Response('{}', { status: 404 });
    const req = Object.assign(Readable.from([Buffer.from(String(init.body ?? '{}'))]), { method: init.method ?? 'GET' });
    const reply = await new Promise<{ status: number; text: string }>((done) => {
      const res = { statusCode: 200, setHeader: () => undefined, end(text: string) { done({ status: this.statusCode, text }); } };
      void handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    });
    return new Response(reply.text, { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  const ask = async (body: unknown) => (await fetcher('/api/reelsmith/depth-track', { method: 'POST', body: JSON.stringify(body) })).json() as Promise<Record<string, unknown>>;
  if (!depthPackInstalled()) {
    assert.deepEqual(await ask({ src: '/media/uploads/a.mp4', fromSec: 0, toSec: 1 }), { available: false });
    console.log('depthTrack.verify: ok (the depth-lite pack is not installed, so no model run)');
  } else {
    // a near bright box sliding over a far, darker, blurred scene: 3 s, 1080x1920
    execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=3', '-f', 'lavfi', '-i', 'color=c=0xe0c090:s=300x700:r=30:d=3',
      '-filter_complex', "[0]boxblur=12,eq=brightness=-0.25[bg];[bg][1]overlay=x='100+200*t':y=900", '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', join(media, 'slide.mp4')]);
    assert.match(JSON.stringify(await ask({ src: '/media/uploads/slide.mp4', fromSec: 2, toSec: 1 })), /toSec not before fromSec/);
    assert.match(JSON.stringify(await ask({ src: '/media/uploads/nope.mp4', fromSec: 0, toSec: 1 })), /media not found/);
    // a clip showing 0.5-2.5 s of the file
    const clip = { id: 'c', track: 'V1', kind: 'video', name: 'slide', src: '/media/uploads/slide.mp4', startFrame: 0, srcInFrame: 15, durationInFrames: 61, effects: [{ id: 'b', assetId: 'builtin:fx-lens-blur', overrides: {} }] } as unknown as TimelineItem;
    const started = Date.now();
    const tracked = await withDepthMap(clip, 30, fetcher);
    const took = Date.now() - started;
    const src = tracked.props?.rsDepthTrackSrc as string;
    assert.equal(src, '/media/uploads/slide.depthv-500-2500.png');
    const file = join(media, 'slide.depthv-500-2500.png');
    const meta = parseDepthTrackMeta(JSON.parse(readFileSync(depthTrackMetaName(file), 'utf8')))!;
    assert.ok(meta, 'the index parses');
    assert.equal(meta.count, 17);
    assert.deepEqual([meta.tileWidth, meta.tileHeight], [360, 640]);
    const { info, data } = await (await loadSharp())(file).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [meta.cols * 360, meta.rows * 640]);
    // a real map, not a flat one (how well the model reads depth is checked on real footage, not on a test pattern)
    let lo = 255, hi = 0;
    for (let i = 0; i < data.length; i += info.channels * 7) { lo = Math.min(lo, data[i]!); hi = Math.max(hi, data[i]!); }
    assert.ok(hi - lo > 60, `the atlas spans near and far (${lo}..${hi})`);
    assert.ok(meta.subject.every((v) => v >= 0 && v <= 1));
    // made once: asked again, the same file
    const mtime = statSync(file).mtimeMs;
    const again = await ask({ src: '/media/uploads/slide.mp4', fromSec: 0.5, toSec: 2.5 });
    assert.equal(again.cached, true);
    assert.equal(statSync(file).mtimeMs, mtime);
    assert.ok(existsSync(depthTrackMetaName(file)));
    console.log(`depthTrack.verify: ok (2 s span, ${meta.count} tiles in ${took} ms with the model load)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
