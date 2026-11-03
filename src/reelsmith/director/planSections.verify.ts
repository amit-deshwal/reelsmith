// RS-1258: plan params are repaired, not refused. Run: node --import tsx src/reelsmith/director/planSections.verify.ts
import assert from 'node:assert/strict';
import type { MoveParam } from './moves';
import { fitsParam, resolveParams, splitSectionParams } from './planSections';

const every = (min: number, max: number, d: number): MoveParam => ({ id: 'every', type: 'number', label: 'every', default: d, min, max });
const cutDefs: MoveParam[] = [every(0.5, 8, 2), { id: 'punch', type: 'number', label: 'punch', default: 0, min: 0, max: 0.3 }];
const capsDefs: MoveParam[] = [every(0.25, 2, 0.5), { id: 'kicker', type: 'text', label: 'kicker', default: '' }, { id: 'x', type: 'number', label: 'x', default: -1, min: -1, max: 1 }];

// the measured refusal: a cut every 4 beats under a punch-caps line; every 4 is the cut's alone
{
  const w: string[] = [];
  const { forMove, forStyle } = splitSectionParams({ every: 4, kicker: '5:48 AM' }, cutDefs, capsDefs, 'sections[3]', { move: 'cut', style: 'punch-caps' }, w);
  assert.deepEqual(forMove, { every: 4 });
  assert.deepEqual(forStyle, { kicker: '5:48 AM' });
  assert.deepEqual(w, []);
}
// a value both can use goes to both
{
  const { forMove, forStyle } = splitSectionParams({ every: 1 }, cutDefs, capsDefs, 's', { move: 'cut', style: 'punch-caps' }, []);
  assert.deepEqual([forMove, forStyle], [{ every: 1 }, { every: 1 }]);
}
// one only the style can use (0.25 is under the cut's 0.5) goes to the style; one neither can use goes to the move (clamped there)
{
  const a = splitSectionParams({ every: 0.25 }, cutDefs, capsDefs, 's', { move: 'cut', style: 'punch-caps' }, []);
  assert.deepEqual([a.forMove, a.forStyle], [{}, { every: 0.25 }]);
  const b = splitSectionParams({ every: 12 }, cutDefs, capsDefs, 's', { move: 'cut', style: 'punch-caps' }, []);
  assert.deepEqual([b.forMove, b.forStyle], [{ every: 12 }, {}]);
}
// a key neither takes is left out with a warning naming what each takes; a number written as text is read
{
  const w: string[] = [];
  const { forMove, forStyle } = splitSectionParams({ y: 0.3, speed: 2, every: '2' }, cutDefs, undefined, 'sections[11]', { move: 'cut' }, w);
  assert.deepEqual(forMove, { every: 2 });
  assert.deepEqual(forStyle, {});
  assert.equal(w.length, 2);
  assert.match(w[0]!, /sections\[11\]: param "y" is not used \(cut takes every, punch\); left out/);
}

// resolveParams: strict without warnings (the restyle tool and graphics still refuse), repairing with them
{
  const errors: string[] = [];
  resolveParams(cutDefs, { every: 99 }, 'p', errors);
  assert.match(errors.join(), /every must be a number from 0.5 to 8/);
  const e2: string[] = [], w: string[] = [];
  const out = resolveParams(cutDefs, { every: 99, punch: -1, nope: 1 }, 'p', e2, w);
  assert.deepEqual(e2, []);
  assert.equal(out.every, 8);
  assert.equal(out.punch, 0);
  assert.equal(out.nope, undefined);
  assert.match(w.join('; '), /p\.every 99 is outside 0.5-8; used 8; p\.punch -1 is outside 0-0.3; used 0; p: param "nope" is not one this takes/);
  // an unusable value keeps the default
  const colour: MoveParam = { id: 'color', type: 'color', label: 'c', default: '#ffffff' };
  const w2: string[] = [];
  assert.equal(resolveParams([colour], { color: 'gold' }, 'q', [], w2).color, '#ffffff');
  assert.match(w2[0]!, /q\.color must be a colour like #ff0000; kept "#ffffff"/);
}

assert.equal(fitsParam(cutDefs[0]!, 0.5), true);
assert.equal(fitsParam(cutDefs[0]!, 0.25), false);
assert.equal(fitsParam(cutDefs[0]!, Number.NaN), false);

console.log('planSections.verify: ok');
