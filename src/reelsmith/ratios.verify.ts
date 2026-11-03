import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RATIO_IDS, RATIO_SIZES, isRatioId, ratioOf } from '../../shared/reelsmith/ratios';
import { recipeForRatio, supportedRatios, type Recipe } from '../../shared/reelsmith/recipe';
import type { MediaAsset } from '../editor/types';
import { runRecipe, type AnalyzeApi } from './runRecipe';
import { samplePlan, sampleRecipe } from './runFixtures';
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

// a recipe with no `ratios` field (the director's own) is 9:16 only
const diary: Recipe = sampleRecipe();
// recipeForRatio / supportedRatios
assert.deepEqual(supportedRatios(diary), ['9:16'], 'a recipe without `ratios` is 9:16 only');
assert.equal(recipeForRatio(diary, '16:9'), null);
const styled: Recipe = { ...diary, styles: { title: { sizePx: 100 } } as never };
const multi: Recipe = { ...styled, ratios: { '16:9': { styles: { [Object.keys(styled.styles)[0]!]: { sizePx: 77 } } }, '4:5': {} } };
assert.deepEqual(supportedRatios(multi), ['9:16', '4:5', '16:9']);
const wide = recipeForRatio(multi, '16:9')!;
assert.deepEqual([wide.canvas.width, wide.canvas.height], [1920, 1080]);
assert.equal(wide.canvas.fps.num, diary.canvas.fps.num, 'fps kept');
assert.equal((wide.styles[Object.keys(styled.styles)[0]!] as { sizePx: number }).sizePx, 77, 'style override applied');
assert.equal(wide.ratios, undefined);
assert.equal(multi.canvas.width, 1080, 'the original is not changed');
assert.notEqual((multi.styles[Object.keys(styled.styles)[0]!] as { sizePx?: number }).sizePx, 77);
assert.equal(recipeForRatio(multi, '9:16')!.canvas.height, 1920);

// a directed reel, in every shape, assembles to that canvas with text inside it
const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames, ...(kind === 'video' ? { width: 1080, height: 1920 } : {}) } as MediaAsset);
const assets = [...Array.from({ length: 24 }, (_, i) => asset(`c${i}`, 'video', 400)), asset('song', 'audio', 3600)];
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: createHash('md5').update(a.id).digest('hex').slice(0, 16), windows: [{ startFrame: 0, endFrame: 400, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0, speech: false }] }),
  musicGrid: async () => ({ durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.3 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};
let combos = 0;
for (const ratio of ['9:16', '4:5', '1:1', '16:9'] as const) {
  const plan = samplePlan(ratio);
  const recipe = sampleRecipe(plan);
  const values = defaultValues(recipe);
  values.media.clips = assets.filter((a) => a.kind === 'video').map((a) => ({ assetId: a.id, kind: 'video' as const }));
  values.media.music = [{ assetId: 'song', kind: 'audio' }];
  const out = await runRecipe(api, { recipe, values, assets, fps: 30, replaceTimeline: true, seed: 5, plan });
  if (!out.action) assert.fail(`${ratio}: did not assemble (${out.messages.join('; ')} ${out.result.report.warnings.join('; ')})`);
  const canvas = out.action.actions.find((a) => a.type === 'setCanvas') as { width: number; height: number };
  assert.deepEqual([canvas.width, canvas.height], [RATIO_SIZES[ratio].width, RATIO_SIZES[ratio].height], `${ratio}: canvas`);
  assert.equal(out.run.ratio, ratio, `${ratio}: the run remembers its shape`);
  for (const a of out.action.actions) {
    if (a.type !== 'add' || a.item.kind !== 'text') continue;
    assert.ok((a.item as { width: number }).width <= RATIO_SIZES[ratio].width, `${ratio}: text box ${a.item.name} fits the canvas width`);
  }
  combos += 1;
}
assert.equal(combos, 4);
console.log(`ratios verify ok (${combos} shapes)`);
