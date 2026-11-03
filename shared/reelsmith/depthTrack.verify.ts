import assert from 'node:assert/strict';
import { MAX_ATLAS_EDGE, parseDepthTrackMeta, subjectAt, subjectDepth, tileRect, tilesAt, trackLayout, TRACK_RATE, type DepthTrackMeta } from './depthTrack.ts';

// a 4 s span of a portrait video: 8 tiles a second, first and last frame included, all inside one texture
const l = trackLayout(2, 6, 1080, 1920);
assert.equal(l.count, 4 * TRACK_RATE + 1);
assert.equal(l.step, 4 / (l.count - 1));
assert.deepEqual([l.tileWidth, l.tileHeight], [360, 640]);
assert.ok(l.cols * l.tileWidth <= MAX_ATLAS_EDGE && l.rows * l.tileHeight <= MAX_ATLAS_EDGE);
// a long span gets smaller tiles before fewer of them, and never more than fits
const long = trackLayout(0, 20, 1920, 1080);
assert.ok(long.tileHeight < 360 && long.cols * long.tileWidth <= MAX_ATLAS_EDGE && long.rows * long.tileHeight <= MAX_ATLAS_EDGE, JSON.stringify(long));
assert.ok(long.count >= 20 * 3, `at least 3 tiles a second (${long.count})`);
const longest = trackLayout(0, 300, 1920, 1080);
assert.ok(longest.step * (longest.count - 1) <= 30 + 1e-9, 'a span is cut at 30 s');
assert.equal(trackLayout(3, 3, 1080, 1920).count, 1);

// tiles either side of a moment, clamped at the ends
const meta = { fromSec: 2, step: 0.125, count: 33 };
assert.deepEqual(tilesAt(meta, 2), { a: 0, b: 1, t: 0 });
const mid = tilesAt(meta, 2.0625);
assert.equal(mid.a, 0); assert.equal(mid.b, 1); assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
assert.deepEqual(tilesAt(meta, 1), { a: 0, b: 1, t: 0 });
assert.deepEqual(tilesAt(meta, 99), { a: 32, b: 32, t: 0 });
assert.deepEqual(tileRect({ cols: 11, tileWidth: 360, tileHeight: 640 }, 12), { x: 360, y: 640, w: 360, h: 640 });

// the subject: a near person in the middle of a far view
const W = 90, H = 160;
const gray = new Uint8Array(W * H).fill(25);
for (let y = 60; y < 150; y++) for (let x = 35; x < 60; x++) gray[y * W + x] = 200;
// the ground at the very bottom is nearer still, but outside the middle band
for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) gray[y * W + x] = 250;
assert.ok(Math.abs(subjectDepth(gray, W, H) - 200 / 255) < 0.02, String(subjectDepth(gray, W, H)));
// RGBA input (a canvas's image data)
const rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) rgba[i * 4] = gray[i]!;
assert.equal(subjectDepth(rgba, W, H, 4), subjectDepth(gray, W, H));

const full: DepthTrackMeta = { version: 1, fromSec: 0, step: 0.5, count: 3, cols: 3, rows: 1, tileWidth: 4, tileHeight: 8, subject: [0.8, 0.6, 0.6] };
assert.ok(Math.abs(subjectAt(full, 0.25) - 0.7) < 1e-9);
assert.deepEqual(parseDepthTrackMeta(JSON.parse(JSON.stringify(full))), full);
assert.equal(parseDepthTrackMeta({ ...full, subject: [0.8] }), null);
assert.equal(parseDepthTrackMeta({ ...full, version: 2 }), null);
console.log('depthTrack.verify: ok');
