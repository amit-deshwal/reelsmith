import assert from 'node:assert/strict';
import type { AtomicAction } from '../../editor/reducerActions';
import { aimMarkers, headOf, pickPerson, type FoundPerson } from './aimMarkers';
import { finaleClock, FINALE_NATURAL_SEC } from './moves';
import { FINALE } from '../postcardGraphics';

// The selfie in "bro said it's a simple trek" (1080x1920 at 1.8 s): the selfie-taker in front, bro behind him in a
// balaclava (no face found). The detector's boxes, measured on the real frame.
const me: FoundPerson = { x: 0.5, y: 0.45, w: 0.5, h: 0.55, score: 0.91, face: { x: 0.68, y: 0.55, w: 0.36, h: 0.2 } };
const bro: FoundPerson = { x: 0.18, y: 0.64, w: 0.41, h: 0.24, score: 0.76 };
const shot = { src: '/media/uploads/selfie.mov', kind: 'video' as const, sec: 1.8, width: 1080, height: 1920 };

assert.equal(pickPerson([me, bro], 'auto', 'bro'), bro, 'a name points past the selfie-taker');
assert.equal(pickPerson([bro, me], 'auto', "that's me"), me, '"me" is the nearest');
assert.equal(pickPerson([me], 'auto', 'bro'), me, 'one person is that person');
assert.equal(pickPerson([], 'auto', 'bro'), undefined);
assert.equal(pickPerson([me, bro], 'left', 'bro'), bro);
assert.equal(pickPerson([me, bro], 'right', 'bro'), me);
assert.equal(pickPerson([me, bro], 'front', 'bro'), me);
assert.equal(pickPerson([me, bro], 'back', 'me'), bro);

assert.deepEqual(headOf(me, shot), me.face, 'a seen face is the head');
const head = headOf(bro, shot);
assert.ok(Math.abs(head.x + head.w / 2 - 0.385) < 0.01 && head.y === bro.y && head.h < bro.h * 0.25, 'no face: the top of the body box');

const marker = (rsAim: Record<string, unknown> | undefined, tx?: number) => ({
  type: 'add', startFrame: 0,
  item: { id: 'm', track: 'T30', kind: 'motion-graphic', name: 'Marker', durationInFrames: 60, width: 1080, height: 1920, props: { rsGraphic: 'annotate', ...(tx === undefined ? {} : { tx, ty: 0.4, tr: 0.12 }), ...(rsAim ? { rsAim } : {}) } },
}) as unknown as AtomicAction;
const propsOf = (a: AtomicAction) => (a as { item: { props: Record<string, unknown> } }).item.props;

{
  const a = marker({ ...shot, who: 'auto', label: 'bro', faced: true }, 0.86);
  const notes = await aimMarkers([a], async () => [me, bro]);
  const p = propsOf(a);
  assert.deepEqual(notes, []);
  assert.equal(p.rsAim, undefined, 'the aim request is consumed');
  assert.ok(Math.abs((p.tx as number) - 0.385) < 0.02 && Math.abs((p.ty as number) - 0.664) < 0.02, `the arrow lands on bro's head, got ${p.tx},${p.ty}`);
}
{
  const a = marker({ ...shot, who: 'auto', label: 'bro', faced: true }, 0.86);
  const notes = await aimMarkers([a], async () => { throw new Error('no detector'); });
  assert.equal(propsOf(a).tx, 0.86, 'nothing found: the face the build found stays');
  assert.equal(notes.length, 1);
}
{
  const a = marker({ ...shot, who: 'auto', label: 'mom', faced: false }, 0.5);
  assert.match((await aimMarkers([a], async () => []))[0]!, /found nobody/);
}
{
  const a = marker(undefined, 0.3);
  await aimMarkers([a], async () => { throw new Error('not called'); });
  assert.equal(propsOf(a).tx, 0.3, 'explicit x/y (no rsAim) is left alone');
}

// cards-finale pacing: moves at 75%, the idles mostly cut, a long section holds the panorama instead of slowing the moves
assert.ok(FINALE_NATURAL_SEC > 5 && FINALE_NATURAL_SEC < 6, `natural finale ${FINALE_NATURAL_SEC}`);
const at = (sec: number) => finaleClock(sec);
assert.ok(Math.abs(at(6.8)(FINALE.shut[1] + 0.2) - 6.8) < 1e-9, 'it ends with the section');
assert.equal(at(9)(FINALE.grid), at(6.8)(FINALE.grid), 'extra time does not slow the moves');
assert.ok(at(9)(FINALE.shut[0]) - at(9)(FINALE.pano[1]) > at(6.8)(FINALE.shut[0]) - at(6.8)(FINALE.pano[1]), 'it goes to the panorama hold');
assert.ok(Math.abs(at(4.85)(FINALE.shut[1] + 0.2) - 4.85) < 1e-9 && at(4.85)(FINALE.grid) < at(6.8)(FINALE.grid), 'a short section squeezes all of it');
assert.ok(at(6.8)(FINALE.grid) < 2.1, `the grid arrives by 2.1 s in a 6.8 s finale (it was 2.5 s), got ${at(6.8)(FINALE.grid)}`);

console.log('aimMarkers.verify: ok');
