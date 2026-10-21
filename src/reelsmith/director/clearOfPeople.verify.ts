import assert from 'node:assert/strict';
import type { AtomicAction } from '../../editor/reducerActions';
import type { FoundPerson } from './aimMarkers';
import { clearCaptionsOfPeople } from './clearOfPeople';

// The selfie under "bro said it's a simple trek" (1080x1920): the selfie-taker in front with his face found, bro behind
// in a balaclava (body box only). The same boxes as aimMarkers.verify.ts.
const me: FoundPerson = { x: 0.5, y: 0.45, w: 0.5, h: 0.55, score: 0.91, face: { x: 0.68, y: 0.55, w: 0.36, h: 0.2 } };
const bro: FoundPerson = { x: 0.18, y: 0.64, w: 0.41, h: 0.24, score: 0.76 };
const canvas = { width: 1080, height: 1920 };
const assets = [{ id: 'selfie', src: '/media/uploads/selfie.mov', kind: 'video', width: 1080, height: 1920 }];
const clip = { type: 'add', startFrame: 0, item: { id: 'v', track: 'V1', kind: 'video', name: 'selfie', src: '/s', sourceAssetId: 'selfie', srcInFrame: 30, durationInFrames: 90, width: 1080, height: 1920 } } as unknown as AtomicAction;
const line = (id: string, text: string, y: number, extra: Record<string, unknown> = {}) =>
  ({ type: 'add', startFrame: 0, item: { id, track: 'T1', kind: 'text', name: id, durationInFrames: 60, props: { text, fontSize: 96, ...extra }, transform: { y } } }) as unknown as AtomicAction;
const yOf = (a: AtomicAction) => ((a as { item: { transform: { y: number } } }).item.transform.y);

const calls: number[] = [];
const find = async (shot: { sec: number }) => { calls.push(shot.sec); return [me, bro]; };

// the caption on bro's head moves above both heads, still inside the safe area
const onBro = line('t1', "bro said it's a simple trek", 16);
const again = line('t2', "bro said it's a simple trek", 16);
const kept = line('t3', 'day 1', -30);
const behind = line('t4', 'TREK', 16, { rsBehind: true });
const actions = [clip, onBro, again, kept, behind];
assert.equal(await clearCaptionsOfPeople(actions, assets, canvas, 30, find), 2);
const c = 0.5 + yOf(onBro) / 100, half = (96 * 1.2) / 2 / 1920;
assert.ok(c + half <= 0.55 - 0.02 + 1e-9, `clear above the selfie-taker's face and bro's head (centre ${c.toFixed(3)})`);
assert.ok(c - half >= 250 / 1920, 'inside the safe area');
assert.equal(yOf(kept), -30, 'a line already clear of everyone stays');
assert.equal(yOf(behind), 16, 'a line behind the person is laid across them on purpose');
assert.deepEqual(calls, [2], 'one look per shot: the middle of the line, 1 s into the source plus 30 frames in');

// a head off to the side of a short line is not under it
const short = line('t5', 'hi', 16);
await clearCaptionsOfPeople([clip, short], assets, canvas, 30, async () => [{ x: 0.0, y: 0.6, w: 0.15, h: 0.3, score: 0.8 }]);
assert.equal(yOf(short), 16, 'a short centred line misses a person at the edge');

// nobody found, or the detector failing, changes nothing
const lone = line('t6', "bro said it's a simple trek", 16);
await clearCaptionsOfPeople([clip, lone], assets, canvas, 30, async () => { throw new Error('no wasm'); });
assert.equal(yOf(lone), 16);
console.log('clearOfPeople.verify: ok');
