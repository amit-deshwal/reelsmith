// Signature styles: one look, one hook accent on the first shot only, one transition type on the cuts; replaces cleanly.
import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from './../editor/reduce';
import type { AtomicAction } from '../editor/reducerActions';
import { activeTimeline, type TimelineItem } from '../editor/types';
import { REEL_LOOKS, isLookEffect } from './looks';
import { SIGNATURES, planSignature, signatureById } from './signatures';
import { REELS_TOOL_NAMES } from './agent/reelsToolSchemas';
import { readFileSync, readdirSync } from 'node:fs';

assert.ok(REELS_TOOL_NAMES.has('reels_apply_signature'));
assert.ok(SIGNATURES.length >= 4 && SIGNATURES.length <= 6, 'a few distinct styles, not a catalogue');
const recipeIds = new Set(readdirSync('recipes').filter((f) => f.endsWith('.recipe.json')).map((f) => f.replace('.recipe.json', '')));
for (const s of SIGNATURES) {
  assert.ok(REEL_LOOKS.some((l) => l.id === s.look), `${s.id}: look exists`);
  assert.ok(s.recipes.length > 0 && s.recipes.every((r) => recipeIds.has(r)), `${s.id}: recipes exist`);
  assert.ok(!s.hook || /^builtin:fx-/.test(s.hook.assetId), `${s.id}: hook is a clip effect`);
}
assert.equal(new Set(SIGNATURES.map((s) => s.transition ?? 'hard')).size, SIGNATURES.length, 'each signature has its own cut style');
const fxSource = readFileSync('src/gl/fx/reelFx.ts', 'utf8');
for (const s of SIGNATURES) if (s.hook) assert.ok(fxSource.includes(`'${s.hook.assetId}'`), `${s.id}: hook effect is registered`);

const clip = (id: string, startFrame: number): TimelineItem => ({ id, track: 'V1', kind: 'video', name: id, startFrame, durationInFrames: 30, props: {} } as TimelineItem);
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'clips', actions: [clip('a', 0), clip('b', 30), clip('c', 60), clip('d', 100)].map((item) => ({ type: 'add', item } as AtomicAction)) });
const state = () => activeTimeline(h.present);

const sig = signatureById('neon-pulse')!;
const plan = planSignature(state(), sig);
assert.equal(plan.clips, 4);
const placed = state().items.slice().sort((x, y) => x.startFrame - y.startFrame);
const touching = placed.slice(1).filter((n, i) => Math.abs(n.startFrame - (placed[i]!.startFrame + placed[i]!.durationInFrames)) <= 2).length;
assert.equal(plan.cuts, touching, 'one transition per touching cut');
assert.ok(plan.cuts >= 2);
h = historyReduce(h, { type: 'batch', label: plan.label, actions: plan.actions });
const items = state().items;
const hooks = items.filter((i) => i.effects?.some((e) => e.assetId === sig.hook!.assetId));
assert.deepEqual(hooks.map((i) => i.id), ['a'], 'the accent is on the first shot only');
assert.ok(items.every((i) => i.effects?.some(isLookEffect)), 'every clip has the look');
assert.equal((state().transitions ?? []).length, plan.cuts);
assert.ok((state().transitions ?? []).every((t) => t.type === 'chroma-glitch'));

// another signature replaces this one; existing transitions are left to the recipe
const retro = planSignature(state(), signatureById('retro-tape')!);
assert.equal(retro.cuts, 0, 'transitions already placed are not doubled');
h = historyReduce(h, { type: 'batch', label: retro.label, actions: retro.actions });
assert.ok(!state().items.some((i) => i.effects?.some((e) => e.assetId === sig.hook!.assetId)), 'the old accent is gone');
assert.equal(state().items[0]!.effects?.filter(isLookEffect).length, REEL_LOOKS.find((l) => l.id === 'retro-vhs')!.steps.length);

// hard cuts on request, and minimal means no accent at all
const empty: History = { past: [], present: emptyProjectDoc(), future: [] };
assert.equal(planSignature(activeTimeline(empty.present), sig).clips, 0);
let h2: History = { past: [], present: emptyProjectDoc(), future: [] };
h2 = historyReduce(h2, { type: 'batch', label: 'clips', actions: [clip('a', 0), clip('b', 30)].map((item) => ({ type: 'add', item } as AtomicAction)) });
assert.equal(planSignature(activeTimeline(h2.present), sig, false).cuts, 0);
const minimal = planSignature(activeTimeline(h2.present), signatureById('clean-minimal')!);
assert.equal(minimal.cuts, 0);
assert.ok(minimal.actions.every((a) => a.type !== 'addTransition'));
// daylight footage must never be steered to the neon grade by words like thrilling or unique
assert.ok(!/thrilling|unique|bold/.test(signatureById('neon-pulse')!.mood));
assert.match(signatureById('cinematic-drift')!.mood, /thrilling/);
console.log('signatures verify ok');
