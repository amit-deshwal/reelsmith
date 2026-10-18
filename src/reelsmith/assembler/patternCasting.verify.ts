import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { SHOT_TAGS, type ShotTag } from '../shotTags';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { castPatternSlots, patternSections, patternSuitability } from './patternCasting';
import type { PlannedShot } from './types';

const tags = (top: ShotTag): AssemblyClip['shot'] => ({
  top, confidence: 0.8, scores: Object.fromEntries(SHOT_TAGS.map((t) => [t, t === top ? 0.8 : 0.2 / (SHOT_TAGS.length - 1)])) as Record<ShotTag, number>,
});
const grey = (v: number) => ({ r: v, g: v, b: v });
const clip = (id: string, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/${id}.mov`, kind: 'video', durationInFrames: 300, score: 0.5, ...extra,
});

// suitability: bright, colourful, sharp scenery beats a dark shot, a flat grey shot and a selfie
const vivid = clip('vivid', { color: { r: 0.3, g: 0.6, b: 0.8 }, sharpness: 0.9, shot: tags('scenery') });
const dark = clip('dark', { color: grey(0.08), sharpness: 0.6 });
const flat = clip('flat', { color: grey(0.5), sharpness: 0.3 });
const selfie = clip('selfie', { color: { r: 0.4, g: 0.5, b: 0.7 }, sharpness: 0.8, shot: tags('portrait') });
for (const worse of [dark, flat, selfie]) assert.ok(patternSuitability(vivid) > patternSuitability(worse), `vivid beats ${worse.assetId}`);
assert.ok(patternSuitability(dark) < patternSuitability(flat), 'crushed blacks are the worst');

// casting: pattern slots take the best clips, plain slots keep the rest in their order; kinds stay per slot
const shots: PlannedShot[] = ['k', 'k', 'plain', 'plain', 'k'].map((section, i) => ({ section, startBeat: i, lengthBeats: 1, startFrame: i * 15, durationInFrames: 15 }));
const mid = clip('mid', { color: { r: 0.5, g: 0.45, b: 0.3 }, sharpness: 0.6 });
const photo = clip('photo', { kind: 'image', color: grey(0.1) });
const picked = [dark, selfie, vivid, mid, photo];
const r = castPatternSlots(picked, shots, picked, new Set(['k']), false);
assert.deepEqual(r.order.map((c) => c.assetId), ['vivid', 'mid', 'dark', 'selfie', 'photo']);
assert.equal(r.swapped, 0);
// a user-chosen opener stays first
assert.equal(castPatternSlots(picked, shots, picked, new Set(['k']), true).order[0], dark);
// an unused clip that suits clearly better replaces the weakest picked clip; nothing repeats
const spare = clip('spare', { color: { r: 0.9, g: 0.5, b: 0.2 }, sharpness: 0.95, shot: tags('detail') });
const s = castPatternSlots(picked, shots, [...picked, spare], new Set(['k']), false);
assert.equal(s.swapped, 1);
assert.ok(s.order.includes(spare) && shots[s.order.indexOf(spare)]!.section === 'k');
assert.equal(new Set(s.order.map((c) => c.assetId)).size, s.order.length);
// no pattern section: untouched
assert.deepEqual(castPatternSlots(picked, shots, picked, new Set(['x']), false).order, picked);

// end to end on Kaleido Trip: dark shots and faces end up in the untouched middle section
const parsed = parseRecipe(readFileSync('recipes/kaleido-trip.recipe.json', 'utf8'));
assert.ok(parsed.ok);
const recipe = parsed.recipe;
assert.deepEqual([...patternSections(recipe)].sort(), ['portal', 'spiral']);
const music: AssemblyMusic = {
  assetId: 'song', name: 'song.mp3', src: '/song.mp3', durationSec: 30,
  beatTimesSec: Array.from({ length: 60 }, (_, i) => 0.25 + i * 0.46), beatsPerBar: 4, downbeatIndex: 0,
};
const pool = Array.from({ length: 45 }, (_, i) => clip(`c${i}`, i % 3 === 0
  ? { color: grey(0.07), sharpness: 0.5, score: 0.9 } // dark, but high-scoring
  : i % 3 === 1 ? { color: { r: 0.3, g: 0.5, b: 0.9 }, sharpness: 0.85, shot: tags('portrait'), score: 0.8 }
  : { color: { r: 0.8, g: 0.6, b: 0.2 }, sharpness: 0.9, shot: tags('scenery'), score: 0.6 }));
const out = assemble({ recipe, music, clips: pool, texts: {}, params: {}, seed: 3 });
assert.ok(out.action);
const placed = (out.action.actions as any[]).filter((a) => a.type === 'add' && a.item.track === 'V1');
const pat = placed.filter((a) => a.item.props.rsSection !== 'trip');
assert.ok(pat.length > 0);
const byId = new Map(pool.map((c) => [c.assetId, c]));
for (const a of pat) {
  const c = byId.get(a.item.sourceAssetId)!;
  assert.equal(c.shot?.top, 'scenery', `${a.item.props.rsSection} shot ${c.assetId} is bright scenery`);
}
assert.equal(new Set(placed.map((a) => a.item.sourceAssetId)).size, placed.length, 'no repeats');
console.log('patternCasting.verify ok');
