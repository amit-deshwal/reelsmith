// Gang Reel leaves out photos that do not fit the frame, and its captions sit on their own track above the flashes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import { aspectMismatch, MISMATCH_LIMIT, runRecipe, SKIP_MISMATCHED_PARAM, type AnalyzeApi } from './runRecipe';
import { defaultValues } from './setupForm';

// 4:5 frame = 0.8
assert.ok(aspectMismatch(1080, 1920, 0.8) < MISMATCH_LIMIT, 'phone portrait is kept in 4:5');
assert.ok(aspectMismatch(3024, 4032, 0.8) < MISMATCH_LIMIT, '3:4 photo is kept');
assert.ok(aspectMismatch(1000, 1000, 0.8) < MISMATCH_LIMIT, 'square is kept');
assert.ok(aspectMismatch(1920, 1080, 0.8) > MISMATCH_LIMIT, '16:9 landscape is skipped');
assert.ok(aspectMismatch(4000, 3000, 0.8) > MISMATCH_LIMIT, '4:3 landscape is skipped');
assert.equal(aspectMismatch(undefined, 100, 0.8), 1, 'unknown size is kept');

const recipe = (() => { const r = parseRecipe(readFileSync('recipes/gang-reel.recipe.json', 'utf8')); assert.ok(r.ok); return r.recipe; })();
const asset = (id: string, kind: MediaAsset['kind'], width?: number, height?: number): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: kind === 'audio' ? 1800 : 300, ...(width ? { width, height } : {}) });
const photos = [
  ...Array.from({ length: 6 }, (_, i) => asset(`land${i}`, 'image', 4000, 3000)),
  ...Array.from({ length: 8 }, (_, i) => asset(`port${i}`, 'image', 3024, 4032)),
];
const videos = Array.from({ length: 30 }, (_, i) => asset(`v${i}`, 'video', 1080, 1920));
const assets = [...photos, ...videos, asset('song', 'audio')];
// distinct 64-bit perceptual hashes so no two fake clips count as near-duplicates
const hashOf = (id: string) => {
  const n = [...id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return ((n * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + (((n + 7) * 0x85ebca6b) >>> 0).toString(16).padStart(8, '0');
};
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: hashOf(a.id), windows: [{ startFrame: 0, endFrame: 200, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0.1, speech: false }] }),
  musicGrid: async () => ({ durationSec: 30, beatTimesSec: Array.from({ length: 70 }, (_, i) => 0.2 + i * 0.4625), beatsPerBar: 4, downbeatIndex: 0 }),
};
const make = (skip: boolean) => {
  const values = defaultValues(recipe);
  values.params[SKIP_MISMATCHED_PARAM] = skip;
  values.media.clips = [...photos, ...videos].map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
  values.media.music = [{ assetId: 'song', kind: 'audio' }];
  return runRecipe(api, { recipe, values, assets, fps: 30, replaceTimeline: true, seed: 2 });
};
const usedPhotos = (out: Awaited<ReturnType<typeof make>>) => new Set((out.action!.actions as any[]).filter((a) => a.item?.kind === 'image').map((a) => String(a.item.sourceAssetId)));

const on = await make(true);
assert.ok(on.action, on.messages.join('; '));
assert.ok(on.messages.some((m) => /Skipped 6 photos/.test(m)), on.messages.join('; '));
assert.ok([...usedPhotos(on)].every((id) => id.startsWith('port')), 'no landscape photo is placed');
const off = await make(false);
assert.ok(!off.messages.some((m) => /Skipped/.test(m)), 'off: nothing skipped');
assert.ok(defaultValues(recipe).params[SKIP_MISMATCHED_PARAM] === true, 'on by default');

// captions are on a different track from the flashes, so nothing overlaps on one lane
const actions = on.action!.actions as any[];
const trackOf = (kind: string) => new Set(actions.filter((a) => a.item?.kind === kind).map((a) => a.item.track));
assert.ok(trackOf('text').size === 1 && trackOf('solid').size === 1, 'one track each');
assert.notDeepEqual([...trackOf('text')], [...trackOf('solid')], 'captions and flashes do not share a track');
console.log('skipMismatched.verify: ok');
