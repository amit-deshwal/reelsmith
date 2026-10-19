import assert from 'node:assert/strict';
import { parseTimeEffectArgs, planTimedEffect } from './timeEffectTool';
import { mixAmountAt } from '../effectMix';

// a 10 s reel at 30 fps: a song with a beat every 0.5 s (grid stored on it) and two clips back to back
const fps = 30;
const state: any = {
  fps, selectedIds: ['b'],
  items: [
    { id: 'song', kind: 'audio', track: 'A1', startFrame: 0, durationInFrames: 300, srcInFrame: 0, props: { rsBeats: { beatTimesSec: Array.from({ length: 40 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 } } },
    { id: 'a', kind: 'video', track: 'V1', startFrame: 0, durationInFrames: 150, effects: [{ id: 'g1', assetId: 'builtin:fx-glitch', overrides: { intensity: 1.2 } }] },
    { id: 'b', kind: 'video', track: 'V1', startFrame: 150, durationInFrames: 150 },
  ],
};
const api = { musicGrid: async () => null };
const args = (raw: Record<string, unknown>) => { const p = parseTimeEffectArgs(raw); assert.ok(!('error' in p), JSON.stringify(p)); return p as Exclude<typeof p, { error: string }>; };

// beat timing across the whole reel: every clip punches on the song's beats, in its own seconds
const beat = await planTimedEffect(state, [], args({ effect: 'glitch', timing: 'beat', fromSec: 0, toSec: 10 }), api);
assert.ok(beat.ok);
const set = (id: string) => (beat as any).actions.find((x: any) => x.type === 'setEffects' && x.id === id);
const aFx = set('a').effects;
assert.equal(aFx.length, 1, 'the existing glitch is re-timed, not doubled');
assert.equal(aFx[0].id, 'g1');
assert.equal(aFx[0].overrides.intensity, 1.2, 'its sliders are kept');
const bMix = set('b').effects[0].mix;
assert.equal(bMix.hits[0], 0, 'clip b punches on the beat at its own start (5 s)');
assert.equal(mixAmountAt(bMix, 0.5, 5), 1, 'and on every beat after');
assert.ok(mixAmountAt(bMix, 0.75, 5) < 0.5, 'falling back between beats');
// a drop at 5 s on the selected clip; a build into 5 s on the clip before it
const drop = await planTimedEffect(state, [], args({ effect: 'zoom-blur', timing: 'drop' }), api);
assert.ok(drop.ok && (drop as any).actions.length === 1 && (drop as any).actions[0].id === 'b');
const build = await planTimedEffect(state, [], args({ effect: 'shake', timing: 'build', itemIds: ['a'], strength: 0.7 }), api);
const buildMix = (build as any).actions[0].effects.at(-1).mix;
assert.ok(mixAmountAt(buildMix, 4.9, 5) > mixAmountAt(buildMix, 1, 5));
assert.equal(buildMix.amount, 0.7);
// region and bad input
const bg = await planTimedEffect(state, [], args({ effect: 'duotone', timing: 'steady', region: 'background', itemIds: ['b'] }), api);
assert.equal((bg as any).actions[0].effects[0].mix.region, 'background');
assert.ok('error' in parseTimeEffectArgs({ effect: 'nope', timing: 'beat' }));
assert.ok('error' in parseTimeEffectArgs({ effect: 'glitch', timing: 'wobble' }));
const silent = await planTimedEffect({ ...state, items: state.items.filter((i: any) => i.kind !== 'audio') }, [], args({ effect: 'glitch', timing: 'beat', itemIds: ['a'] }), api);
assert.ok(!silent.ok && /steady beat/.test((silent as any).error));
console.log('timeEffectTool: ok');
