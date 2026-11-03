// Reels transitions (zoom through, whip blur, spin zoom, light leak, chroma glitch, fluted glass, ripple dissolve, tile pop,
// cube turn, slide over): registered everywhere the editor lists transitions, uniforms match the shader sources, default
// lengths, one undo step, the agent can see them, and recipes may name them. Pixels are checked by
// server/reelsmith/transitions-sheet.mts (progress 0 and 1 equal the plain clips).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, GLSL_TRANSITION_TYPES, REEL_TRANSITION_SECONDS, TRANSITION_LABELS, TRANSITION_ORDER } from '../editor/types';
import { previewTransitionType } from '../editor/transitionPreview';
import { GLSL_TRANSITIONS } from '../gl/transitions';
import { BREAK_IN_INFO, breakInDefaultFrames } from './breakInInfo';
import { RECIPE_TRANSITIONS } from './assembler/transitions';
import { RECIPE_SCHEMA } from '../../shared/reelsmith/recipe-schema';

const TYPES = Object.keys(REEL_TRANSITION_SECONDS) as Array<keyof typeof REEL_TRANSITION_SECONDS & string>;
assert.equal(TYPES.length, 17);
const DIRECTIONS = ['left', 'right', 'up', 'down'] as const;
const declared = (src: string) => [...src.matchAll(/^uniform\s+(?!sampler)\w+\s+(u_\w+)/gm)].map((m) => m[1]!);
const file = (name: string) => readFileSync(new URL(`../gl/shaders/${name}.frag`, import.meta.url), 'utf8');

const GLSL = GLSL_TRANSITIONS as unknown as Record<string, { frag: string; uniforms: (o: { time: number; aspect: number; direction: string }) => Record<string, unknown> }>;

for (const type of TYPES) {
  assert.ok(GLSL_TRANSITION_TYPES.has(type) && TRANSITION_ORDER.includes(type as never), `${type} registered`);
  assert.ok(TRANSITION_LABELS[type as never] && !/[一-鿿]/.test(TRANSITION_LABELS[type as never]), `${type} has an English label`);
  assert.ok(previewTransitionType(type as never), `${type} has a playback preview`);
  const src = file(type);
  assert.equal(GLSL[type]!.frag, src.replace(/\r\n?/g, '\n'), 'the generated .frag.ts twin is current');
  assert.match(src, /^#version 300 es/, `${type}: GLSL ES 3.0`);
  assert.match(src, /uniform float u_progress;/, `${type} reads u_progress`);
  const names = declared(src).filter((n) => !['u_outgoing', 'u_incoming', 'u_progress'].includes(n));
  for (const dir of DIRECTIONS) {
    const set = Object.keys(GLSL[type]!.uniforms({ time: 0, aspect: 9 / 16, direction: dir })).sort();
    assert.deepEqual(set, [...names].sort(), `${type}/${dir}: every declared uniform is set, none extra`);
  }
  // the ends are exact: nothing may pow() a value that can dip below 0 at progress 1 (sin(pi) is -8.7e-8)
  for (const m of src.matchAll(/pow\(\s*sin\(/g)) assert.fail(`${type}: pow(sin(..)) is undefined for negatives at progress 1; clamp with max(..., 0.0) (${m.index})`);
  assert.ok(BREAK_IN_INFO[type] && BREAK_IN_INFO[type]!.length > 60, `${type}: the agent is told what it does`);
  assert.ok(RECIPE_TRANSITIONS[type], `${type}: a recipe can name it`);
  assert.equal(RECIPE_TRANSITIONS[type]!.type, type);
  assert.ok((RECIPE_SCHEMA as unknown as { properties: { structure: { items: { properties: { transition: { enum: string[] } } } } } }).properties.structure.items.properties.transition.enum.includes(type), `${type} is allowed by the recipe schema`);
}

// directional ones really change with the direction
const dirOf = (type: string, d: 'left' | 'right' | 'up' | 'down') => JSON.stringify(GLSL[type]!.uniforms({ time: 0, aspect: 1, direction: d }));
for (const type of ['whip-blur', 'light-leak', 'slide-over', 'cube-turn', 'film-burn', 'flip-3d', 'prism-flash']) assert.notEqual(dirOf(type, 'left'), dirOf(type, 'right'), `${type}: left and right differ`);
assert.notEqual(dirOf('cube-turn', 'left'), dirOf('cube-turn', 'up'), 'cube-turn: vertical differs from horizontal');

// default lengths: each has its own, between 0.3 and 0.6 s, capped by the shorter clip, and the agent helper agrees
for (const type of TYPES) {
  const s = REEL_TRANSITION_SECONDS[type]!;
  assert.ok(s >= 0.3 && s <= 0.6, `${type} default ${s}s`);
  assert.equal(breakInDefaultFrames(type, 30, 1000), Math.round(s * 30));
  assert.equal(breakInDefaultFrames(type, 30, 5), 5, 'capped by the clips');
}
assert.equal(breakInDefaultFrames('cross-dissolve', 30, 100), null, 'the editor keeps its own default for the others');

// added in the editor: default length, one undo step, undo removes it
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
for (const [id, start] of [['a', 0], ['b', 90]] as const) {
  h = historyReduce(h, { type: 'add', startFrame: start, item: { id, track: 'V1', kind: 'video', name: id, src: `/${id}.mp4`, durationInFrames: 90 } } as never);
}
for (const type of TYPES) {
  const before = h.past.length;
  h = historyReduce(h, { type: 'addTransition', id: `t-${type}`, incomingItemId: 'b', transType: type } as never);
  const t = (activeTimeline(h.present).transitions ?? []).find((x) => x.id === `t-${type}`);
  assert.equal(t?.type, type);
  assert.equal(t?.durationInFrames, Math.round(REEL_TRANSITION_SECONDS[type]! * activeTimeline(h.present).fps), `${type}: default length`);
  assert.equal(h.past.length, before + 1, `${type}: one undo step`);
  h = historyReduce(h, { type: 'undo' } as never);
  assert.equal((activeTimeline(h.present).transitions ?? []).length, 0, `${type}: undo removes it`);
}
console.log('reelTransitions.verify ok');
