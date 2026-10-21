// Imported GL Transitions and the remotion-transitions ports (shaders/glt, server/reelsmith/import-gl-transitions.mts): every one is registered wherever the
// editor, the director and the agent list transitions, and its shader matches our two-input contract. Compiling and the
// untouched ends are checked in a browser by server/reelsmith/transitions-sheet.mts (a shader that fails to compile falls
// back to a dissolve, so read its log for "shader compile failed").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLSL_TRANSITION_TYPES, TRANSITION_LABELS, TRANSITION_ORDER, defaultTransitionSeconds } from '../editor/types';
import { GLSL_TRANSITIONS } from '../gl/transitions';
import { GLT_FRAGS } from '../gl/shaders/glt/frags';
import { GLT_TRANSITIONS } from './glTransitionsMeta';
import { BREAK_IN_INFO } from './breakInInfo';
import { RECIPE_TRANSITIONS } from './assembler/transitions';
import { DIRECTOR_TRANSITIONS } from './director/catalog';
import { TRANSITION_CUES } from './director/sfx';

assert.ok(GLT_TRANSITIONS.length >= 30, 'the import brought in a real set');
assert.equal(new Set(GLT_TRANSITIONS.map((t) => t.id)).size, GLT_TRANSITIONS.length, 'ids are unique');
const GLSL = GLSL_TRANSITIONS as unknown as Record<string, { frag: string; uniforms: (o: { time: number; aspect: number; direction: string }) => Record<string, unknown> }>;

for (const t of GLT_TRANSITIONS) {
  assert.ok(GLSL_TRANSITION_TYPES.has(t.id) && TRANSITION_ORDER.includes(t.id as never), `${t.id} registered in the editor`);
  assert.equal(TRANSITION_LABELS[t.id as never], t.label);
  assert.ok(t.label && !/[一-鿿]/.test(t.label), `${t.id} has an English label`);
  assert.ok(t.seconds >= 0.3 && t.seconds <= 1.2, `${t.id} default ${t.seconds}s`);   // colour covers hold the screen, so up to 1.2 s
  assert.equal(defaultTransitionSeconds(t.id), t.seconds);
  assert.ok(t.looks.length > 15 && t.use.length > 10, `${t.id}: the director is told what it looks like and when to use it`);
  assert.ok(DIRECTOR_TRANSITIONS.some((d) => d.id === t.id), `${t.id} is in the director catalogue`);
  assert.deepEqual(RECIPE_TRANSITIONS[t.id], { type: t.id, seconds: t.seconds }, `${t.id}: plans can name it`);
  assert.ok(t.id in TRANSITION_CUES && TRANSITION_CUES[t.id] === t.cue, `${t.id} has its sound cue`);
  assert.ok((BREAK_IN_INFO[t.id] ?? '').length > 60, `${t.id}: the agent is told what it does`);

  const src = readFileSync(new URL(`../gl/shaders/glt/${t.id}.frag`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
  assert.equal(GLT_FRAGS[t.id], src, `${t.id}: the generated .frag.ts twin is current`);
  assert.equal(GLSL[t.id]!.frag, src);
  assert.match(src, /^#version 300 es/, `${t.id}: GLSL ES 3.0`);
  assert.match(src, /void main\(\)/);
  const declared = [...src.matchAll(/^uniform\s+\w+\s+(u_\w+)/gm)].map((m) => m[1]!).sort();
  assert.deepEqual(declared, ['u_aspect', 'u_incoming', 'u_outgoing', 'u_progress'], `${t.id}: only the contract uniforms`);
  for (const dir of ['left', 'right', 'up', 'down']) {
    assert.deepEqual(Object.keys(GLSL[t.id]!.uniforms({ time: 0, aspect: 9 / 16, direction: dir })), ['u_aspect'], `${t.id}/${dir}`);
  }
  assert.doesNotMatch(src, /texture2D|\bvarying\b|gl_FragColor/, `${t.id}: no GLSL ES 1.0 leftovers`);
  // GLSL ES will not convert an int literal to a float constant (the first import lost 18 shaders to this)
  for (const m of src.matchAll(/^const float \w+ = (-?\d+);/gm)) assert.fail(`${t.id}: float constant with an int literal: ${m[0]}`);
  assert.match(src, /Adapted from (GL Transitions|GTKottman\/remotion-transitions)/, `${t.id}: credits the source`);
}

// the dated slideshow shapes are gone; the kept imports carry the polish (ease, motion blur) unless they bring their own
for (const id of ['heart-wipe', 'star-wipe', 'polka-dots', 'pinwheel', 'bounce-drop']) assert.ok(!GLSL_TRANSITION_TYPES.has(id), `${id} dropped`);
assert.match(GLT_FRAGS['swirl'], /Reelsmith polish/);
assert.doesNotMatch(GLT_FRAGS['cross-zoom'], /Reelsmith polish/, 'cross-zoom has its own blur and easing');
console.log(`glTransitions.verify: ${GLT_TRANSITIONS.length} imported transitions registered and contract-clean`);
