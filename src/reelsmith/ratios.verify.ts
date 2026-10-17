import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { RATIO_IDS, RATIO_SIZES, isRatioId, ratioOf } from '../../shared/reelsmith/ratios';
import { parseRecipe, recipeForRatio, supportedRatios, validateRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import { runRecipe, type AnalyzeApi } from './runRecipe';
import { defaultValues } from './setupForm';

// the table
for (const id of RATIO_IDS) {
  const { width, height } = RATIO_SIZES[id];
  const [a, b] = id.split(':').map(Number) as [number, number];
  assert.ok(Math.abs(width / height - a / b) < 0.001, `${id} has the right shape`);
  assert.equal(ratioOf(width, height), id);
  assert.ok(isRatioId(id));
}
assert.equal(ratioOf(1000, 1000), undefined);
assert.ok(!isRatioId('2:1'));

const load = (file: string): Recipe => { const r = parseRecipe(readFileSync(`recipes/${file}`, 'utf8')); assert.ok(r.ok, file); return r.recipe; };
const files = readdirSync('recipes').filter((f) => f.endsWith('.recipe.json')).sort();
// a recipe with no `ratios` field, however many bundled recipes declare them by now
const { ratios: _declared, ...bare } = load('mini-vlog.recipe.json');
const diary: Recipe = bare;

// recipeForRatio / supportedRatios
assert.deepEqual(supportedRatios(diary), ['9:16'], 'bundled recipes without `ratios` are 9:16 only');
assert.equal(recipeForRatio(diary, '16:9'), null);
const multi: Recipe = { ...diary, ratios: { '16:9': { styles: { [Object.keys(diary.styles)[0]!]: { sizePx: 77 } } }, '4:5': {} } };
assert.deepEqual(supportedRatios(multi), ['9:16', '4:5', '16:9']);
const wide = recipeForRatio(multi, '16:9')!;
assert.deepEqual([wide.canvas.width, wide.canvas.height], [1920, 1080]);
assert.equal(wide.canvas.fps.num, diary.canvas.fps.num, 'fps kept');
assert.equal((wide.styles[Object.keys(diary.styles)[0]!] as { sizePx: number }).sizePx, 77, 'style override applied');
assert.equal(wide.ratios, undefined);
assert.equal(multi.canvas.width, 1080, 'the original is not changed');
assert.notEqual((multi.styles[Object.keys(diary.styles)[0]!] as { sizePx?: number }).sizePx, 77);
assert.equal(recipeForRatio(multi, '9:16')!.canvas.height, 1920);

// validation
assert.ok(validateRecipe(multi).ok);
const withBad = (ratios: unknown) => validateRecipe({ ...diary, ratios });
assert.ok(!withBad({ '16:9': { styles: { nope: {} } } }).ok, 'unknown style');
assert.ok(!withBad({ '9:16': {} }).ok, "the recipe's own ratio is not listed again");
assert.ok(!withBad({ '2:1': {} }).ok, 'unknown ratio');
assert.ok(!withBad({ '16:9': { canvas: { width: 5, height: 5 } } }).ok, 'canvas cannot be set by hand');

// every bundled recipe, in every shape it is allowed, assembles to that canvas with text inside it
const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames, ...(kind === 'video' ? { transcript: Array.from({ length: 24 }, (_, i) => ({ text: `w${i}${i % 4 === 3 ? '.' : ''}`, start: 500 + i * 380 + Math.floor(i / 4) * 1420, end: 800 + i * 380 + Math.floor(i / 4) * 1420 })) } : {}) } as MediaAsset);
const assets = [...Array.from({ length: 48 }, (_, i) => asset(`c${i}`, 'video', 400)), asset('song', 'audio', 3600)];
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: createHash('md5').update(a.id).digest('hex').slice(0, 16), windows: [{ startFrame: 0, endFrame: 400, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0, speech: false }] }),
  musicGrid: async () => ({ durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.3 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};
let combos = 0;
for (const file of files) {
  const base = load(file);
  const all: Recipe = { ...base, ratios: Object.fromEntries(RATIO_IDS.filter((r) => r !== ratioOf(base.canvas.width, base.canvas.height)).map((r) => [r, {}])) };
  assert.ok(validateRecipe(all).ok, `${file} with all ratios validates`);
  for (const ratio of supportedRatios(all)) {
    const values = defaultValues(all);
    for (const input of all.inputs) {
      if (input.kind === 'text') { values.texts[input.id] = input.placeholder ?? 'Kalsubai'; continue; }
      const pool = input.accept.includes('audio') ? [assets[48]!] : assets.slice(0, 48);
      values.media[input.id] = pool.slice(0, input.max).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'audio' }));
    }
    const out = await runRecipe(api, { recipe: all, ratio, values, assets, fps: 30, replaceTimeline: true, seed: 5 });
    const where = `${file} @ ${ratio}`;
    if (!out.action) { assert.fail(`${where}: did not assemble (${out.messages.join('; ')} ${out.result.report.warnings.join('; ')})`); }
    const canvas = out.action.actions.find((a) => a.type === 'setCanvas') as { width: number; height: number };
    assert.deepEqual([canvas.width, canvas.height], [RATIO_SIZES[ratio].width, RATIO_SIZES[ratio].height], `${where}: canvas`);
    assert.equal(out.run.ratio, ratio, `${where}: the run remembers its shape`);
    for (const a of out.action.actions) {
      if (a.type !== 'add' || a.item.kind !== 'text') continue;
      assert.ok((a.item as { width: number }).width <= RATIO_SIZES[ratio].width, `${where}: text box ${a.item.name} fits the canvas width`);
    }
    combos += 1;
  }
}
assert.ok(combos >= files.length * 3, `swept ${combos} recipe × ratio combinations`);
console.log(`ratios verify ok (${combos} recipe × ratio combinations)`);
