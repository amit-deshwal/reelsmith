import assert from 'node:assert/strict';
import { MATCH_EFFECT_ID, matchEffect, planShotMatch, type ColorStats } from './shotMatch';
import { withCropFocus } from './runRecipe';

const m = (entries: Record<string, ColorStats>) => new Map(Object.entries(entries));
const grey = (v: number): ColorStats => ({ r: v, g: v, b: v });

// too few shots: nothing to match against
assert.equal(planShotMatch(m({ a: grey(0.3), b: grey(0.6) })).size, 0);

// a dark shot is brightened and a bright one pulled down, both only part of the way
const plan = planShotMatch(m({ dim: grey(0.3), mid1: grey(0.45), mid2: grey(0.45), bright: grey(0.65) }));
assert.ok(plan.get('dim')![1] > 1 && plan.get('dim')![1] <= 1.3, 'dim shot gets brighter, within the clamp');
assert.ok(plan.get('bright')![1] < 1 && plan.get('bright')![1] >= 0.8, 'bright shot gets darker, within the clamp');
assert.ok(!plan.has('mid1') && !plan.has('mid2'), 'shots at the median are left alone');
assert.ok(plan.get('dim')![1] < 0.45 / 0.3, 'only part of the way to the target');

// a blue-cast phone clip is warmed toward the group; warm sunset-like shots stay put when the group is warm too
const warm: ColorStats = { r: 0.55, g: 0.45, b: 0.35 };
const cool: ColorStats = { r: 0.35, g: 0.45, b: 0.58 };
const wb = planShotMatch(m({ w1: warm, w2: warm, w3: warm, cool }));
assert.ok(wb.get('cool')![0] > wb.get('cool')![2], 'cool shot: red up relative to blue');
assert.ok(!wb.has('w1'), 'the group median cast is the target, so matching shots are not touched');
for (const g of wb.get('cool')!) assert.ok(g >= 0.8 * 0.9 - 1e-9 && g <= 1.3 * 1.1 + 1e-9, 'gains stay inside the clamps');

// night shots neither move nor set the target
const night = planShotMatch(m({ n: grey(0.08), a: grey(0.4), b: grey(0.5), c: grey(0.6) }));
assert.ok(!night.has('n'), 'night shot is left alone');
assert.ok(!night.has('b'));

// effect: neutral gain maps to the neutral wheel, gain 1.3 stays inside 0..1
const e = matchEffect([1, 1.3, 0.8]);
assert.equal(e.id, MATCH_EFFECT_ID);
assert.deepEqual((e.overrides as { gainColor: number[] }).gainColor.map((v) => Math.round(v * 1000) / 1000), [0.5, 0.7, 0.367]);

// wired into the assembly: matching effects land on the clips that need them, not on the ones at the median
const clip = (id: string, color: ColorStats) => ({ assetId: id, name: id, src: `/${id}`, kind: 'image' as const, width: 1080, height: 1920, durationInFrames: 30, score: 1, color });
const clips = [clip('dim', grey(0.3)), clip('x', grey(0.45)), clip('y', grey(0.45)), clip('bright', grey(0.65))];
const out = withCropFocus(clips.map((c) => ({ type: 'add' as const, startFrame: 0, item: { id: c.assetId, track: 'V1', kind: 'image' as const, name: c.name, src: c.src, sourceAssetId: c.assetId, durationInFrames: 30 } })), clips, { width: 1080, height: 1920 });
const fx = (id: string) => { const a = out.find((x) => x.type === 'add' && x.item.id === id); return a && a.type === 'add' ? a.item.effects : undefined; };
assert.equal(fx('dim')?.[0]?.id, MATCH_EFFECT_ID);
assert.equal(fx('bright')?.[0]?.id, MATCH_EFFECT_ID);
assert.equal(fx('x'), undefined);
console.log('shotMatch.verify: ok');
