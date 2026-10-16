import assert from 'node:assert/strict';
import { barStartSec, doubleTempo, fitToBars, gridFromTempo, halveTempo, musicStart, setDownbeat, shiftPhase, tapTempo } from './beatGrid';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const g = gridFromTempo(120, 0.3, 30);
near(g.beatTimesSec[0]!, 0.3); near(g.beatTimesSec[1]! - g.beatTimesSec[0]!, 0.5);
assert.equal(g.beatsPerBar, 4);

// phase drag
near(shiftPhase(g, 0.1).beatTimesSec[0]!, 0.4);
assert.ok(shiftPhase(g, -0.5).beatTimesSec.every((t) => t >= 0));
const shiftedPastStart = shiftPhase(g, -0.5);
assert.equal(shiftedPastStart.downbeatIndex, 3, 'removing a leading beat preserves bar positions');
near(shiftedPastStart.beatTimesSec[3]!, g.beatTimesSec[4]! - 0.5);
const later = shiftPhase(g, 0.3); // first beat 0.6 s: one beat now fits in front of it
assert.equal(later.beatTimesSec.length, g.beatTimesSec.length + 1);
near(later.beatTimesSec[0]!, 0.1); near(later.beatTimesSec[1]!, 0.6);
assert.equal(later.downbeatIndex, (g.downbeatIndex + 1) % 4, 'the old downbeat is still the same beat');
assert.equal(shiftPhase(g, -100), g, 'phase edits cannot discard the whole grid');

// tap tempo, with one sloppy tap
const taps = [0, 0.5, 1.0, 1.52, 2.0, 2.5, 3.9];
near(tapTempo(taps)!, 120, 2);
assert.equal(tapTempo([0, 1]), null);

// half / double round-trip
const h = halveTempo(g);
near(h.beatTimesSec[1]! - h.beatTimesSec[0]!, 1.0);
const d = doubleTempo(h);
near(d.beatTimesSec[1]! - d.beatTimesSec[0]!, 0.5);
assert.equal(d.beatTimesSec.length, h.beatTimesSec.length * 2 - 1);

// downbeat
const sd = setDownbeat(g, g.beatTimesSec[6]! + 0.05);
assert.equal(sd.downbeatIndex, 2);
near(barStartSec(sd, 1)!, g.beatTimesSec[6]!);

// start policies land on a downbeat
near(musicStart('fromStart', g), 0);
near(musicStart('firstDownbeat', g), g.beatTimesSec[0]!);
const loud = musicStart('loudestSection', g, { loudestSec: 10.1 });
assert.ok(g.beatTimesSec.some((t, i) => i % 4 === g.downbeatIndex && Math.abs(t - loud) < 1e-9), 'on a bar');
assert.ok(Math.abs(loud - 10.1) <= 1.0);
near(musicStart('userOffset', g, { offsetSec: 0 }), 0.3);

// fit reel length to whole bars (2 s per bar)
near(fitToBars(g, 0.3, 14.2), 14);
near(fitToBars(g, 0.3, 15.5, 'down'), 14);
near(fitToBars(g, 0.3, 15.5, 'nearest'), 16);
near(fitToBars(g, 0.3, 15.5, 'nearest', { maxSec: 15 }), 14); // nearest bar inside the max length
near(fitToBars(g, 0.3, 1, 'nearest', { minSec: 5 }), 6); // nearest bar inside the min length
console.log('beatGrid.verify: ok');
