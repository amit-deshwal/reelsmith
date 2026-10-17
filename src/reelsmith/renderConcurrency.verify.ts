// RS-803: 4K sources render fastest with few workers; light sources keep the automatic count.
import assert from 'node:assert/strict';
// @ts-expect-error plain .mjs has no .d.ts
import { HEAVY_SOURCE_CONCURRENCY, HEAVY_SOURCE_PIXELS, maxSourcePixels, resolveSourceAwareConcurrency } from '../../remotion/performance.mjs';

const asset = (id: string, width: number, height: number) => ({ id, kind: 'video', width, height });
const clip = (id: string, sourceAssetId: string) => ({ id, kind: 'video', sourceAssetId });
const state4k = { assets: [asset('a', 2160, 3840), asset('b', 540, 960)], items: [clip('1', 'b'), clip('2', 'a')] };
const stateLight = { assets: [asset('b', 540, 960), asset('c', 1080, 1920)], items: [clip('1', 'b'), clip('2', 'c')] };
const noEnv = { override: undefined };

assert.equal(maxSourcePixels(state4k), 2160 * 3840, 'largest source wins');
assert.equal(maxSourcePixels(stateLight), 1080 * 1920);
assert.equal(maxSourcePixels({ assets: [], items: [{ kind: 'video', sourceAssetId: 'missing' }] }), 0, 'unknown size counts as light');
assert.equal(maxSourcePixels(undefined), 0);
assert.equal(maxSourcePixels({ assets: [], items: [{ kind: 'video', width: 3840, height: 2160 }] }), 3840 * 2160, 'item size is used when the asset is unknown');
assert.equal(maxSourcePixels({ assets: [asset('x', 5000, 5000)], items: [{ kind: 'audio', sourceAssetId: 'x' }] }), 0, 'only picture items count');

// 4K: capped at 2, never raised above a lower automatic value
assert.equal(resolveSourceAwareConcurrency(state4k, { base: 8, ...noEnv }), HEAVY_SOURCE_CONCURRENCY);
assert.equal(resolveSourceAwareConcurrency(state4k, { base: 1, ...noEnv }), 1);
// 1080p portrait (2.07 MP) and 1440p (3.7 MP) stay automatic; the line is at 4 MP
assert.equal(resolveSourceAwareConcurrency(stateLight, { base: 8, ...noEnv }), 8);
assert.ok(2560 * 1440 < HEAVY_SOURCE_PIXELS && 3840 * 2160 >= HEAVY_SOURCE_PIXELS);
// an explicit override is never second-guessed (the base already holds it)
assert.equal(resolveSourceAwareConcurrency(state4k, { base: 6, override: '6' }), 6);
assert.equal(resolveSourceAwareConcurrency(stateLight, { base: 3, override: '3' }), 3);
console.log('renderConcurrency.verify ok');
