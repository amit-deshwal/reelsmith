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
assert.deepEqual(await clearCaptionsOfPeople(actions, assets, canvas, 30, find), { moved: 2, stuck: [] });
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

// A line drawn by the text engine (rise-lines, typewriter, shine...: a motion graphic placed by props.x/y) is moved the
// same way. Before 2026-11-10 only plain text items were, so most director lines stayed on heads.
import { TEXT_GRAPHIC_CODE } from './textGraphic';
const engine = (id: string, y: number, extra: Record<string, unknown> = {}) =>
  ({ type: 'add', startFrame: 0, item: { id, track: 'T1', kind: 'motion-graphic', name: id, code: TEXT_GRAPHIC_CODE, durationInFrames: 60, width: 1080, height: 1920, props: { text: 'slipped on every single rock\non the way up', fontSize: 100, align: 'left', x: 0.08, y, maxWidth: 0.84, ...extra } } }) as unknown as AtomicAction;
const pY = (a: AtomicAction) => (a as { item: { props: { y: number } } }).item.props.y;
const rise = engine('g1', 0.66), placed = engine('g2', 0.66, { rsFixedPosition: true }), other = { ...engine('g3', 0.66), item: { ...(engine('g3', 0.66) as { item: object }).item, code: 'const X = () => null;' } } as unknown as AtomicAction;
assert.deepEqual(await clearCaptionsOfPeople([clip, rise, placed, other], assets, canvas, 30, find), { moved: 1, stuck: [] });
const gh = (2 * 100 * 1.08) / 2 / 1920;
assert.ok(pY(rise) + gh <= 0.55 - 0.02 + 1e-9 && pY(rise) - gh >= 250 / 1920, `the engine line clears both heads inside the safe area (y ${pY(rise).toFixed(3)})`);
assert.equal(pY(placed), 0.66, 'a line the plan placed itself stays');
assert.equal(pY(other), 0.66, 'another motion graphic is not a line');

// a line over a run of cuts sits on several shots: the heads of each are cleared, not only the longest shot's
const second = { type: 'add', startFrame: 40, item: { id: 'v2', track: 'V1', kind: 'video', name: 'top', src: '/t', sourceAssetId: 'top', srcInFrame: 0, durationInFrames: 20, width: 1080, height: 1920 } } as unknown as AtomicAction;
const firstShot = { ...clip, item: { ...(clip as { item: object }).item, durationInFrames: 40 } } as unknown as AtomicAction;
const both = [...assets, { id: 'top', src: '/media/uploads/top.mov', kind: 'video', width: 1080, height: 1920 }];
const tall: FoundPerson = { x: 0.3, y: 0.1, w: 0.4, h: 0.8, score: 0.9, face: { x: 0.4, y: 0.14, w: 0.2, h: 0.12 } };
const over = line('t7', "bro said it's a simple trek", -30);
const perShot = async (shot: { src: string }) => (shot.src.includes('top') ? [tall] : [me, bro]);
assert.equal((await clearCaptionsOfPeople([firstShot, second, over], both, canvas, 30, perShot)).moved, 1, 'the head in the shorter second shot counts');
const oc = 0.5 + yOf(over) / 100;
assert.ok(oc - half >= 0.26 + 0.02 - 1e-9 && oc + half <= 0.55 - 0.02 + 1e-9, `between the tall person's face and the selfie heads (centre ${oc.toFixed(3)})`);

// no height clear of everyone: the line stays and the build is told
const crowd: FoundPerson[] = Array.from({ length: 8 }, (_, i) => ({ x: 0.1, y: 0.1 + i * 0.09, w: 0.8, h: 0.09, score: 0.9, face: { x: 0.2, y: 0.1 + i * 0.09, w: 0.6, h: 0.08 } }));
const jammed = line('t8', "bro said it's a simple trek", 0);
const jam = await clearCaptionsOfPeople([clip, jammed], assets, canvas, 30, async () => crowd);
assert.equal(jam.moved, 0);
assert.equal(yOf(jammed), 0);
assert.match(jam.stuck[0]!, /"bro said it's a simple trek" at 0\.0 s covers a head/);
console.log('clearOfPeople.verify: ok');
