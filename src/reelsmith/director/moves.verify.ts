// Speed curves on speed-ramp (the curve-speed presets of mobile editors) and the transitions that carry a direction
// (swipe-up / swipe-down, the feed swipe) or are Reelsmith's own shaders (lens-cover, stretch, pull-back).
import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { addRecipeTransition, RECIPE_TRANSITIONS } from '../assembler/transitions';
import { bindTracks } from '../trackBinding';
import { directorRecipe } from './assembleDirector';
import { DIRECTOR_TRANSITIONS } from './catalog';
import { moveById, SPEED_CURVE_IDS, SPEED_CURVES, speedCurveParts } from './moves';
import { TRANSITION_CUES } from './sfx';

// every curve fills the section exactly, mixes speeds, and fills in the slow-motion param
for (const id of SPEED_CURVE_IDS) {
  const parts = speedCurveParts(id, 0.35);
  assert.ok(Math.abs(parts.reduce((s, [share]) => s + share, 0) - 1) < 1e-9, `${id} adds up to the whole section`);
  assert.ok(new Set(parts.map(([, r]) => r)).size > 1, `${id} changes speed`);
  assert.ok(parts.every(([, r]) => r > 0 && r <= 4), `${id} rates in range`);
}
assert.deepEqual(speedCurveParts('ramp', 0.35), [[0.3, 1], [0.45, 0.35], [0.25, 2.5]], 'the default is the old ramp');
assert.equal(speedCurveParts('bullet', 0.35)[1]![1], 0.21, 'bullet time is slower than the slow param');
assert.ok(speedCurveParts('flash-in', 0.35)[0]![1] > 2 && speedCurveParts('flash-out', 0.35).at(-1)![1] > 2, 'flash in starts fast, flash out ends fast');
assert.deepEqual(speedCurveParts('nonsense', 0.5), speedCurveParts('ramp', 0.5), 'an unknown curve plays the ramp');
const curveParam = moveById('speed-ramp')!.params.find((p) => p.id === 'curve')!;
assert.deepEqual(curveParam.options, Object.keys(SPEED_CURVES), 'the director can name every curve');

// the new transitions are in the catalogue with a sound, and plans can name them
for (const id of ['swipe-up', 'swipe-down', 'lens-cover', 'stretch', 'pull-back']) {
  assert.ok(id in RECIPE_TRANSITIONS, `${id}: plans can name it`);
  assert.ok(DIRECTOR_TRANSITIONS.some((t) => t.id === id), `${id}: in the director catalogue`);
  assert.ok(TRANSITION_CUES[id], `${id}: has a sound cue`);
}
assert.equal(RECIPE_TRANSITIONS.slideUp!.direction, 'up', 'slideUp goes up (it used to whip sideways)');
const plain = { type: 'addTransition' as const, id: 'x', incomingItemId: 'b', transType: 'flash' as const };
assert.equal(addRecipeTransition(RECIPE_TRANSITIONS.flash!, plain).length, 1, 'no direction, no patch');

// a reel: a hero speed curve swiped into, a flash-out into a lens cover, a stretch out
const fps = 30;
const clip = (id: string, sec: number): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5 });
const clips = [clip('fort', 12), clip('climb', 14), clip('ridge', 10), clip('summit', 9)];
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const parsed = parsePlan({
  ratio: '9:16', music: 'song',
  sections: [
    { move: 'hold', beats: 4, clips: ['fort'] },
    { move: 'speed-ramp', beats: 8, clips: ['climb'], params: { curve: 'hero' }, transition: 'swipe-up' },
    { move: 'speed-ramp', beats: 4, clips: ['ridge'], params: { curve: 'flash-out' }, transition: 'stretch' },
    { move: 'hold', beats: 4, clips: ['summit'], transition: 'lens-cover' },
  ],
});
assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
const plan = (parsed as { plan: ReelPlan }).plan;
const res = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
assert.ok(res.action, res.report.warnings.join('; '));
const acts = res.action!.actions as any[];
const shots = (asset: string) => acts.filter((a) => a.type === 'add' && a.item?.sourceAssetId === asset).sort((a, b) => a.startFrame - b.startFrame);
const rate = (a: any) => a.item.playbackRate ?? 1;

// hero: normal, a burst, the long slow moment, a burst, normal; the source keeps running forward
const hero = shots('climb');
assert.deepEqual(hero.map(rate), [1, 2.6, 0.35, 2.6, 1]);
for (let i = 1; i < hero.length; i++) {
  const prev = hero[i - 1]!;
  assert.equal(hero[i]!.startFrame, prev.startFrame + prev.item.durationInFrames, 'back to back');
  assert.ok(hero[i]!.item.srcInFrame >= prev.item.srcInFrame + Math.round(prev.item.durationInFrames * rate(prev)) - 1, 'no jump back in the source');
}
assert.ok(hero[2]!.item.durationInFrames > hero[1]!.item.durationInFrames * 2, 'the slow moment is the long part');
assert.deepEqual(shots('ridge').map(rate), [1, 1.7, 3.2], 'flash-out races away');

// the swipe lands as a whip-blur pointing up; the others as their own shaders
const trs = acts.filter((a) => a.type === 'addTransition');
assert.deepEqual(trs.map((t) => t.transType), ['whip-blur', 'stretch', 'lens-cover']);
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
let n = 0;
const h = historyReduce({ past: [], present: doc, future: [] }, bindTracks(res.action!, doc.timelines[0] as any, () => `track_${n++}`));
const placed = (h.present.timelines[0] as any).transitions as Array<{ type: string; direction?: string }>;
assert.deepEqual(placed.map((t) => [t.type, t.direction ?? null]), [['whip-blur', 'up'], ['stretch', null], ['lens-cover', null]]);
console.log('moves: speed curves and the swipe, stretch and lens-cover transitions ok');
