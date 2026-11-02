// Runnable: `npx tsx src/generate/media-export.geometry.verify.ts`
// The export's output size and fps leave the timeline alone: the server scales by the shorter side and retimes.
import assert from 'node:assert';
import { exportOutputGeometry } from './media-export';

const landscape = { fps: 30, width: 1920, height: 1080 };
const reel = { fps: 60, width: 1080, height: 1920 };

assert.deepStrictEqual(exportOutputGeometry(landscape, { resolution: '720p' }), { width: 1280, height: 720, fps: 30 });
const r480 = exportOutputGeometry(landscape, { resolution: '480p' });
assert.ok(Math.abs(r480.height - 480) <= 8, `${r480.height}`); // the server renders exact multiples of 16:9 (864x486)
assert.ok(Math.abs(r480.width / r480.height - 16 / 9) < 0.02);
assert.deepStrictEqual(exportOutputGeometry(landscape, { fps: 60 }), { width: 1920, height: 1080, fps: 60 });

// a 9:16 reel at 1080p is 1080x1920 (it came out 608x1080 when the height was set to 1080)
assert.deepStrictEqual(exportOutputGeometry(reel, { resolution: '1080p' }), { width: 1080, height: 1920, fps: 60 });
const both = exportOutputGeometry(reel, { resolution: '720p', fps: 24 });
assert.strictEqual(both.width, 720);
assert.strictEqual(both.fps, 24);
assert.ok(both.width < both.height);
// no override: the timeline's own size and rate; an unsupported fps is ignored
assert.deepStrictEqual(exportOutputGeometry(reel, {}), { width: 1080, height: 1920, fps: 60 });
assert.strictEqual(exportOutputGeometry(reel, { fps: 29 }).fps, 60);

console.log('media-export.geometry.verify: ok');
