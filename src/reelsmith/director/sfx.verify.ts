import assert from 'node:assert/strict';
import { SOUND_LEVELS, sfxActions, soundPeakSec, soundVolume, TRANSITION_CUES } from './sfx';
import { SOUND_EFFECTS } from '../../audio/soundLibrary';
import { DIRECTOR_TRANSITIONS } from './catalog';

type Add = { type: 'add'; startFrame: number; item: { id: string; track: string; src: string; durationInFrames: number; srcInFrame?: number; volume: number; props: { rsSfx: string } } };
const fps = 30;
const id = (...p: Array<string | number>) => p.join('-');
const run = (events: Parameters<typeof sfxActions>[0], level: 'auto' | 'subtle' | 'off' = 'auto', total = 600) => sfxActions(events, { fps, total, level, id }) as unknown as Add[];

// every sound the cues use exists in the library, and every director transition has a cue entry
for (const t of DIRECTOR_TRANSITIONS) assert.ok(t.id in TRANSITION_CUES, `cue for ${t.id}`);

// every cue sound is measured and exists; quiet files are lifted, loud ones lowered, nothing pushed past -1 dBFS or volume 2
for (const id of Object.keys(SOUND_LEVELS)) assert.ok(SOUND_EFFECTS.some((x) => x.id === id), id);
assert.ok(soundVolume('short-shutter-click', -21) > 1 && soundVolume('short-shutter-click', -21) <= 2);
assert.ok(soundVolume('deep-impact-hit', -16) < 1);
assert.ok(soundVolume('deep-impact-hit', 0) <= 10 ** (-1 / 20) + 1e-3, 'peak stays under -1 dBFS');
assert.equal(soundVolume('vine-boom-impact', -20), 0.8);
// a whoosh peaks on the cut
const [w] = run([{ frame: 300, cue: 'whoosh' }]);
assert.equal(w!.startFrame + Math.round(soundPeakSec('simple-whoosh') * fps), 300);
assert.equal(w!.item.track, 'A2');
// a riser ends on its frame
const [r] = run([{ frame: 300, cue: 'riser' }]);
assert.equal(r!.startFrame + r!.item.durationInFrames, 300);
// a sound that would start before the reel is trimmed at its start instead of moved
const [early] = run([{ frame: 2, cue: 'whoosh-heavy' }]);
assert.equal(early!.startFrame, 0);
assert.ok((early!.item.srcInFrame ?? 0) > 0);
// two on one cut: the hit wins; a run of flash-cut shutters is thinned out
assert.deepEqual(run([{ frame: 100, cue: 'shutter' }, { frame: 102, cue: 'hit' }]).map((a) => a.item.props.rsSfx), ['hit']);
assert.equal(run([0, 5, 10, 15, 20, 25, 30].map((f) => ({ frame: 100 + f, cue: 'shutter' as const }))).length, 3);
// a riser into a hit on the same cut keeps both (the riser ends where the hit lands)
assert.deepEqual(run([{ frame: 200, cue: 'riser' }, { frame: 200, cue: 'hit' }]).map((a) => a.item.props.rsSfx).sort(), ['hit', 'riser']);
// overlapping sounds go on separate lanes
const both = run([{ frame: 150, cue: 'riser' }, { frame: 135, cue: 'whoosh' }]);
assert.notEqual(both[0]!.item.track, both[1]!.item.track);
// subtle is quieter, off is silent, a hand-placed sound is always kept (and wins its moment)
assert.ok(run([{ frame: 300, cue: 'hit' }], 'subtle')[0]!.item.volume < run([{ frame: 300, cue: 'hit' }])[0]!.item.volume);
assert.equal(run([{ frame: 300, cue: 'hit' }], 'off').length, 0);
assert.deepEqual(run([{ frame: 100, cue: 'hit' }, { frame: 101, cue: 'pop', soundId: 'clean-ding' }]).map((a) => a.item.src), ['/sound-effects/clean-ding.mp3']);
// nothing runs past the reel
assert.ok(run([{ frame: 595, cue: 'hit' }]).every((a) => a.startFrame + a.item.durationInFrames <= 600));
console.log('sfx: ok');
