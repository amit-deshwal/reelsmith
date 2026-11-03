import assert from 'node:assert/strict';
import { envelopeFrame, mixAmountAt, mixUniformsAt, parseEffectMix } from './effectMix';
import { fxPasses } from '../gl/fx/uniforms';
import { ALL_FX } from '../gl/fx/effects';
import reelCopyFrag from '../gl/fx/reel-copy.frag.ts';
import reelMixFrag from '../gl/fx/reel-mix.frag.ts';

const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// no mix: full strength, as before
assert.equal(mixAmountAt(undefined, 1, 2), 1);
assert.equal(mixUniformsAt(undefined, 1, 2), undefined);
// amount and span
near(mixAmountAt({ amount: 0.4 }, 1, 2), 0.4);
assert.equal(mixAmountAt({ span: [1, 2] }, 0.5, 3), 0);
assert.equal(mixAmountAt({ span: [1, 2] }, 2.5, 3), 0);
near(mixAmountAt({ span: [1, 2] }, 1.5, 3), 1);
// fades
near(mixAmountAt({ fadeIn: 0.5 }, 0, 2), 0);
near(mixAmountAt({ fadeIn: 0.5 }, 0.25, 2), 0.5);
near(mixAmountAt({ fadeIn: 0.5 }, 0.5, 2), 1);
near(mixAmountAt({ fadeOut: 0.5 }, 2, 2), 0);
// ramp up builds across the span
near(mixAmountAt({ ramp: 'up' }, 0, 4), 0);
near(mixAmountAt({ ramp: 'up' }, 2, 4), 0.5);
near(mixAmountAt({ ramp: 'up' }, 4, 4), 1);
near(mixAmountAt({ ramp: 'down' }, 4, 4), 0);
// beat hits: full on the beat, falling back to the floor between beats
const beat = { hits: [0, 0.5, 1], decay: 0.1, floor: 0.2 };
near(mixAmountAt(beat, 0.5, 2), 1);
assert.ok(mixAmountAt(beat, 0.6, 2) < 0.6);
assert.ok(mixAmountAt(beat, 0.95, 2) < 0.25 && mixAmountAt(beat, 0.95, 2) >= 0.2);
near(mixAmountAt({ hits: [0.5] }, 0.2, 2), 0); // before the first hit: the floor (0)
// region code
assert.deepEqual(mixUniformsAt({ region: 'background', amount: 0.5 }, 0, 1), { amount: 0.5, region: 2 });

// parsing from agents
assert.ok(parseEffectMix({ amount: 0.5, region: 'subject', hits: [1, 0.5], fadeIn: 0.2 }).ok);
const parsed = parseEffectMix({ hits: [1, 0.5] });
assert.ok(parsed.ok && parsed.mix.hits![0] === 0.5);
const bad = parseEffectMix({ amount: 2, region: 'water', span: [2, 1] });
assert.ok(!bad.ok && bad.errors.length === 3);

// the pass graph: full-strength effects are unchanged; a partial one gets a copy of its input and a blend after it
const def = ALL_FX['builtin:fx-sepia']!;
const plain = fxPasses([{ def }], 0);
assert.ok(plain.every((p) => p.frag !== reelMixFrag && p.frag !== reelCopyFrag));
const half = fxPasses([{ def, mix: { amount: 0.5, region: 0 } }], 0);
assert.equal(half[0]!.frag, reelCopyFrag);
assert.equal(half.at(-1)!.frag, reelMixFrag);
assert.deepEqual(half.at(-1)!.samplers, { u_before: 0 });
assert.equal(half.at(-1)!.uniforms!.u_amount, 0.5);
// a second blended effect reads the first effect's blended output as its "before"
const two = fxPasses([{ def }, { def, mix: { amount: 1, region: 2, hasMask: 1 } }], 0);
assert.equal(two[0]!.frag, def.frag);
assert.deepEqual(two.at(-1)!.samplers, { u_before: plain.length - 1 });
assert.equal(two.at(-1)!.uniforms!.u_region, 2);
// an effect at zero strength is skipped; with nothing left the clip still draws
assert.deepEqual(fxPasses([{ def, mix: { amount: 0, region: 0 } }], 0).map((p) => p.frag), [reelCopyFrag]);

// motion effects scale their own strength instead of crossfading (no double image); others keep the blend
const shake = ALL_FX['builtin:fx-shake']!;
const sh = envelopeFrame(shake.id, shake.props, { strength: 2 }, { amount: 0.5, region: 0 });
assert.equal(sh.mix, undefined);
assert.equal(sh.overrides!.strength, 1);
assert.equal(sh.overrides!.zoom, 1 + (1.15 - 1) * 0.5, 'unset params scale from their default');
const shBg = envelopeFrame(shake.id, shake.props, {}, { amount: 0.5, region: 2 });
assert.deepEqual(shBg.mix, { amount: 1, region: 2 }, 'a region still blends, at full');
const sepia = envelopeFrame(def.id, def.props, { intensity: 0.8 }, { amount: 0.5, region: 0 });
assert.deepEqual(sepia, { overrides: { intensity: 0.8 }, mix: { amount: 0.5, region: 0 } });

console.log('effectMix: ok');
