import assert from 'node:assert/strict';
import { bridgeGaps, duckAmount, duckGainAt } from './duckEnvelope';

const fps = 30;
const speech = [[60, 120]] as const; // 2-4 s
const db = (g: number) => 20 * Math.log10(g);

assert.equal(duckAmount(0, speech, fps), 0, 'open well before speech');
assert.equal(duckAmount(60, speech, fps), 1, 'fully ducked on the first speech frame');
assert.equal(duckAmount(119, speech, fps), 1);
assert.equal(duckAmount(200, speech, fps), 0, 'open again after the release');
assert.ok(Math.abs(db(duckGainAt(90, speech, fps, -12)) + 12) < 1e-9, 'depth under speech');

// no frame-to-frame step larger than ~2 dB at 30 fps, for -12 dB
let worst = 0;
for (let f = 0; f < 200; f += 1) worst = Math.max(worst, Math.abs(db(duckGainAt(f + 1, speech, fps, -12)) - db(duckGainAt(f, speech, fps, -12))));
assert.ok(worst <= 2, `largest per-frame step ${worst.toFixed(2)} dB`);
// attack starts before the speech, release ends after it
assert.ok(duckAmount(57, speech, fps) > 0 && duckAmount(59, speech, fps) < 1);
assert.ok(duckAmount(121, speech, fps) > 0 && duckAmount(131, speech, fps) < 1);
// monotonic ramps
for (let f = 50; f < 60; f += 1) assert.ok(duckAmount(f + 1, speech, fps) >= duckAmount(f, speech, fps));
for (let f = 120; f < 135; f += 1) assert.ok(duckAmount(f + 1, speech, fps) <= duckAmount(f, speech, fps));

// two lines with a 0.4 s pause: the music stays ducked across it instead of pumping up
const two = [[60, 90], [102, 120]] as const;
for (let f = 90; f < 102; f += 1) assert.equal(duckAmount(f, two, fps), 1, `held through the pause (frame ${f})`);
// a 1 s pause is long enough to come back up
const apart = [[60, 90], [120, 150]] as const;
assert.ok(duckAmount(105, apart, fps) < 0.5, 'recovers in a longer pause');
assert.deepEqual(bridgeGaps([[120, 150], [60, 90], [95, 100]], 15), [[60, 100], [120, 150]], 'sorted and bridged');
// empty or reversed ranges are ignored
assert.equal(duckGainAt(10, [[30, 30], [50, 40]], fps, -12), 1);
console.log('duckEnvelope.verify: ok');
