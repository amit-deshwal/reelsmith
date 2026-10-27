import assert from 'node:assert/strict';
import { slamStarts } from './textStyles';

// RS-1202 slam: words land on the beat, but the whole line stays up about a second before it leaves
const fps = 30;
const beat = 0.48; // Believer, ~125 bpm
const ctx = (seconds: number) => ({ start: 0, end: Math.round(seconds * fps), fps, beatFrame: (b: number) => Math.round(b * beat * fps) });
// the user reel's ending: 4 words, 2 beats a word, 3.9 s → the last word landed 0.4 s before the fade
const ending = slamStarts(ctx(3.87), 4, 2);
const latest = 3.87 - 0.35 - 1.16 - 0.28;
assert.ok(ending.at(-1)! <= latest + 1e-6, String(ending));
assert.deepEqual(ending.map((s) => Math.round(s * fps)), [0, 14, 29, 43], 'one beat a word, still on the beat');
// plenty of time: the asked spacing stays
assert.deepEqual(slamStarts(ctx(8), 3, 2).map((s) => Math.round(s * fps)), [0, 29, 58]);
// far too many words for the time: evenly spaced, the last one still leaves time to read
const crowded = slamStarts(ctx(2), 8, 1);
assert.equal(crowded.length, 8);
assert.ok(crowded.at(-1)! <= 2 - 0.3 - 0.8 - 0.28 + 1e-6);
assert.deepEqual(slamStarts(ctx(3), 1, 1), [0]);
console.log('slamTiming.verify ok');
