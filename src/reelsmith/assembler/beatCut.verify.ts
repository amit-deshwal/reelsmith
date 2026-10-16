import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { detectDropBeat } from './drop';

const r = parseRecipe(readFileSync('recipes/beat-cut.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;
const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 60,
  beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const clips = (n: number): AssemblyClip[] => Array.from({ length: n }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 7) % 13) / 13,
}));

// energy: quiet for 16 beats, loud afterwards
const energy = Array.from({ length: 60 }, (_, i) => (i < 24 ? 0.2 : 0.9));
assert.equal(detectDropBeat(energy, 4), 24);
assert.equal(detectDropBeat(Array(60).fill(0.5), 4), null, 'flat energy has no drop');
// bars that start at beat 3 (downbeat index): a step at beat 31 is a bar start, and is reported as such
const shifted = Array.from({ length: 64 }, (_, i) => (i < 31 ? 0.05 : 0.9));
assert.equal(detectDropBeat(shifted, 4, 2, 3), 31, 'drop follows the downbeat offset');

const params = { dropAtS: 0, flashOnBars: true, beforeDrop: 'everyBar' };
const dropSec = 0.25 + 24 * 0.5; // beat 24 of the song
const res = assemble({ recipe, clips: clips(80), music: { ...music, dropSec }, texts: {}, params, seed: 3 });
assert.ok(res.action);
const v1 = res.action!.actions.filter((a: any) => a.item?.track === 'V1') as any[];
// the reel starts one build (16 beats) before the drop, so the drop lands at frame 16 beats in
const dropFrame = 16 * 15;
const before = v1.filter((a) => a.startFrame < dropFrame);
const after = v1.filter((a) => a.startFrame >= dropFrame);
assert.ok(before.every((a) => a.item.durationInFrames === 60), 'build: one cut per bar');
assert.ok(after.every((a) => a.item.durationInFrames === 15), 'drop: one cut per beat');
assert.equal(before.length, 4); assert.equal(after.length, 12);
assert.equal(res.report.musicStartSec, 0.25 + 8 * 0.5, 'music starts 16 beats before the drop');
const flashes = res.action!.actions.filter((a: any) => a.item?.kind === 'solid') as any[];
assert.ok(flashes.length > 0 && flashes.every((f) => f.startFrame >= dropFrame && f.startFrame % 60 === 0), 'flash on bar starts in the drop only');
assert.equal(assemble({ recipe, clips: clips(80), music: { ...music, dropSec }, texts: {}, params: { ...params, flashOnBars: false }, seed: 3 })
  .action!.actions.filter((a: any) => a.item?.kind === 'solid').length, 0);

// too few clips: asks the user instead of padding
const few = assemble({ recipe, clips: clips(6), music: { ...music, dropSec }, texts: {}, params, seed: 3 });
assert.equal(few.action, null);
assert.ok(few.report.needsMoreMedia && few.report.needsMoreMedia.need > few.report.needsMoreMedia.have);

// manual drop time overrides detection
const manual = assemble({ recipe, clips: clips(80), music, texts: {}, params: { ...params, dropAtS: 0.25 + 16 * 0.5 }, seed: 3 });
const firstBeatCut = (manual.action!.actions.filter((a: any) => a.item?.track === 'V1') as any[]).find((a) => a.item.durationInFrames === 15);
assert.equal(firstBeatCut.startFrame, 16 * 15);
console.log('beatCut.verify: ok');
