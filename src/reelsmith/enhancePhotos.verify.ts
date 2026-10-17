import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import { ENHANCE_ABOVE, ENHANCE_PHOTOS_PARAM, coverEnlargement, prepareAssembly, type AnalyzeApi } from './runRecipe';
import { defaultValues } from './setupForm';
import { upscaleName } from '../../server/reelsmith/upscale';

assert.equal(upscaleName('IMG_0458.JPG'), 'IMG_0458.x2.jpg');
assert.equal(coverEnlargement(800, 600, { width: 1080, height: 1920 }), 3.2);
assert.ok(coverEnlargement(4000, 3000, { width: 1080, height: 1920 }) < ENHANCE_ABOVE, 'a 12 MP photo is never enhanced');
assert.ok(coverEnlargement(1080, 1920, { width: 1080, height: 1920 }) <= 1);

const r = parseRecipe(readFileSync('recipes/photo-dump.recipe.json', 'utf8'));
assert.ok(r.ok);
const photo = (id: string, width: number, height: number): MediaAsset => ({ id, name: id, kind: 'image', src: `/media/uploads/${id}.jpg`, width, height, durationInFrames: 90 });
const assets = [photo('small', 800, 600), photo('big', 4000, 3000), photo('portrait', 900, 1200), photo('p2', 3000, 4000), photo('p3', 3000, 4000), photo('p4', 3000, 4000)];
const calls: string[] = [];
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: (a.id.charCodeAt(1) % 16).toString(16).repeat(16), windows: [{ startFrame: 0, endFrame: 30, sharpness: 0.6, exposure: 0.7, motion: 0, subject: 0, speech: false }] }),
  musicGrid: async () => null,
  upscale: async (a) => { calls.push(a.id); return a.id === 'portrait' ? null : { src: `/media/uploads/${a.id}.x2.jpg`, width: a.width! * 2, height: a.height! * 2 }; },
};
const inputId = r.recipe.inputs.find((i) => i.kind === 'media' && i.id !== r.recipe.music?.inputId)!.id;
const run = async (enhance: boolean) => {
  const values = defaultValues(r.recipe);
  values.media[inputId] = assets.map((a) => ({ assetId: a.id, kind: 'image' as const }));
  values.params[ENHANCE_PHOTOS_PARAM] = enhance;
  return prepareAssembly(api, { recipe: r.recipe, values, assets, fps: 30, replaceTimeline: true, seed: 1 });
};

const off = await run(false);
assert.equal(calls.length, 0, 'off by default: nothing is upscaled');
assert.ok(off.input.clips.every((c) => !c.src.includes('.x2.')));

const on = await run(true);
assert.deepEqual(calls.sort(), ['portrait', 'small'], 'only photos enlarged past the limit are sent');
const small = [...on.input.clips, ...(on.input.broll ?? [])].find((c) => c.assetId === 'small')!;
assert.equal(small.src, '/media/uploads/small.x2.jpg');
assert.deepEqual([small.width, small.height], [1600, 1200]);
const portrait = [...on.input.clips, ...(on.input.broll ?? [])].find((c) => c.assetId === 'portrait')!;
assert.equal(portrait.src, '/media/uploads/portrait.jpg', 'a failed upscale keeps the original');
assert.ok(on.messages.some((m) => /Enhanced 1 small photo/.test(m)));
console.log('enhancePhotos.verify: ok');
