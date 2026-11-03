// RS-1263 world swap: the person is one continuous cut-out item over the whole section, the place behind changes on every
// beat (the person's own place first), the own place shares the cut-out's framing, and plans can name the move.
import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { withFrontCutouts, FRONT_CUTOUT } from './frontCutout';
import { directorRecipe } from './assembleDirector';
import { moveById } from './moves';
import { swapBeats, swapPlaces } from './worldSwap';

// spans: one place a beat; a half-step sliver at the end joins the place before it
assert.deepEqual(swapBeats(4, 1), [[0, 1], [1, 2], [2, 3], [3, 4]]);
assert.deepEqual(swapBeats(9, 4), [[0, 4], [4, 9]], 'a 1-beat tail of a 4-beat step joins the last place');
assert.deepEqual(swapBeats(6, 4), [[0, 4], [4, 6]], 'a tail of half a step stays its own place');
assert.deepEqual(swapPlaces('me', ['a', 'b'], 5, true), ['me', 'a', 'b', 'a', 'b']);
assert.deepEqual(swapPlaces('me', ['a', 'b'], 3, false), ['a', 'b', 'a']);
assert.equal(moveById('world-swap')!.clipCount!(8, {}, 1080, 1920), 8, 'eight beats: the person and seven places');
assert.equal(moveById('world-swap')!.clipCount!(16, {}, 1080, 1920), 9, 'capped at nine clips');

const fps = 30;
const clip = (id: string, sec: number, kind: 'video' | 'image' = 'video', w = 1080, h = 1920): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind, width: w, height: h, durationInFrames: Math.round(sec * fps), score: 0.5 });
const walk = { ...clip('walk', 12, 'video', 1920, 1080), sourceAnalysis: { windows: [{ startFrame: 0, endFrame: 360, score: 0.8, focusRect: { x: 0.6, y: 0.2, w: 0.15, h: 0.7 } }] } } as unknown as AssemblyClip;
const clips = [walk, clip('paris', 6), clip('tokyo', 6), clip('goa', 1, 'image')];
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const build = (section: Record<string, unknown>, list = clips) => {
  const parsed = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['paris'] }, section] });
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const plan = (parsed as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips: list, music, texts: {}, params: {}, seed: 5, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  return { acts: res.action!.actions as any[], warnings: res.report.warnings };
};

const { acts } = build({ move: 'world-swap', beats: 6, clips: ['walk', 'paris', 'tokyo', 'goa'] });
const adds = acts.filter((a) => a.type === 'add');
const person = adds.filter((a) => a.item.props?.rsFront);
assert.equal(person.length, 1, 'the person is one item: no jump');
const p = person[0]!;
assert.equal(p.item.sourceAssetId, 'walk');
const sectionStart = p.startFrame, sectionEnd = p.startFrame + p.item.durationInFrames;
const places = adds.filter((a) => (a.item.kind === 'video' || a.item.kind === 'image') && !a.item.props?.rsFront && a.startFrame >= sectionStart && a.startFrame < sectionEnd)
  .sort((a, b) => a.startFrame - b.startFrame);
assert.deepEqual(places.map((a) => a.item.sourceAssetId), ['walk', 'paris', 'tokyo', 'goa', 'paris', 'tokyo'], 'own place, then a new place every beat');
assert.ok(places.every((a) => a.item.track !== p.item.track), 'places on their own lane under the person');
for (let i = 1; i < places.length; i++) assert.equal(places[i]!.startFrame, places[i - 1]!.startFrame + places[i - 1]!.item.durationInFrames, 'places back to back');
assert.equal(places[0]!.startFrame, sectionStart);
assert.equal(places.at(-1)!.startFrame + places.at(-1)!.item.durationInFrames, sectionEnd, 'places cover the section');
const beat = 15; // 0.5 s beats at 30 fps
assert.ok(places.slice(1, -1).every((a) => a.item.durationInFrames === beat), 'one beat each');
// the own place is the same moment and framing as the cut-out above it
assert.equal(places[0]!.item.srcInFrame, p.item.srcInFrame);
assert.deepEqual(places[0]!.item.transform, p.item.transform);
assert.ok(p.item.transform && p.item.transform.x < 0, 'framed toward the person on the right of a landscape shot');
// the cut-out is added after looks and matching, like every front copy
const finished = withFrontCutouts(acts).find((a: any) => a.type === 'add' && a.item.id === p.item.id) as any;
assert.equal(finished.item.effects.at(-1).assetId, FRONT_CUTOUT);

// start somewhere else; no places at all plays one shot with a note
const elsewhere = build({ move: 'world-swap', beats: 4, clips: ['walk', 'paris', 'tokyo'], params: { own: false, every: 2 } });
const ef = elsewhere.acts.find((a) => a.type === 'add' && a.item.props?.rsFront)!;
const eplaces = elsewhere.acts.filter((a) => a.type === 'add' && !a.item.props?.rsFront && (a.item.kind === 'video' || a.item.kind === 'image') && a.startFrame >= ef.startFrame).sort((a, b) => a.startFrame - b.startFrame);
assert.deepEqual(eplaces.map((a) => [a.item.sourceAssetId, a.item.durationInFrames]), [['paris', 2 * beat], ['tokyo', 2 * beat]], 'own: false starts in the first place; every: 2 holds each for two beats');
const alone = build({ move: 'world-swap', beats: 4, clips: ['walk'] }, [walk, clip('paris', 6)]);
assert.ok(alone.warnings.some((w) => /needs places/.test(w)) || alone.acts.some((a) => a.type === 'add' && a.item.props?.rsFront), 'one clip: a note, or the caster added a place');
console.log('worldSwap: ok');
