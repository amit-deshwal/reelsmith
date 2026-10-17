// Reel looks: every step is a real effect with in-range sliders; applying a look replaces only the effects a look added,
// keeps hand-added ones, touches only video/photo clips, "none" clears, and the agent tool is one undo step.
import assert from 'node:assert/strict';
import type { AgentContext } from '../agent/context';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import type { AtomicAction } from '../editor/reducerActions';
import { activeTimeline } from '../editor/types';
import { ALL_FX } from '../gl/fx/effects';
import { execReelsTool, type ReelsDeps } from './agent/reelsTools';
import { REELS_TOOL_NAMES } from './agent/reelsToolSchemas';
import { isLookEffect, lookById, lookEffects, planLook, REEL_LOOKS } from './looks';

assert.equal(REEL_LOOKS.length, 14);
assert.equal(new Set(REEL_LOOKS.map((l) => l.id)).size, 14, 'unique ids');
for (const look of REEL_LOOKS) {
  assert.ok(look.name && look.mood && look.description.length > 30 && !/[一-鿿]/.test(look.name + look.description), `${look.id}: described in English`);
  assert.ok(look.steps.length >= 2 && look.steps.length <= 6, `${look.id}: 2 to 6 effects`);
  const ids = new Set<string>();
  look.steps.forEach((step, i) => {
    const def = ALL_FX[step.assetId];
    assert.ok(def, `${look.id}/${i}: ${step.assetId} is a real effect`);
    for (const [key, value] of Object.entries(step.overrides ?? {})) {
      const prop = def!.props.find((p) => p.key === key);
      assert.ok(prop, `${look.id}/${i}: ${step.assetId} has no slider "${key}"`);
      if (prop!.kind !== 'color') assert.ok(typeof value === 'number' && value >= prop!.min && value <= prop!.max, `${look.id}/${i}: ${key}=${String(value)} is inside [${prop!.min}, ${prop!.max}]`);
    }
    assert.notEqual(step.assetId, 'builtin:fx-vignette', 'the plain vignette cuts to black; looks use the soft one');
    assert.notEqual(step.assetId, 'builtin:fx-film-grain', 'the plain grain streaks on portrait video; looks use the fine one');
    ids.add(lookEffects(look)[i]!.id);
  });
  assert.equal(ids.size, look.steps.length, `${look.id}: effect ids are unique`);
  // grade first, texture last: a colour grade comes before any glow or grain
  const kinds = look.steps.map((s) => (/look-/.test(s.assetId) ? 0 : /grain|vhs|damage|vignette|cartoon/.test(s.assetId) ? 2 : 1));
  assert.deepEqual([...kinds].sort(), kinds, `${look.id}: grade, then glow/lens, then texture`);
}
assert.ok(REELS_TOOL_NAMES.has('reels_apply_look'), 'the agent is offered the tool');

// planLook
const clip = (id: string, kind: string, effects?: Array<{ id: string; assetId: string }>) => ({ id, track: 'V1', kind, name: id, src: `/${id}`, durationInFrames: 60, ...(effects ? { effects } : {}) }) as never;
const items = [
  clip('a', 'video'), clip('b', 'image', [{ id: 'fx_mine', assetId: 'builtin:fx-sepia' }, { id: 'look_old-film_0', assetId: 'builtin:fx-sepia' }]),
  clip('c', 'audio'), clip('d', 'text'),
];
const first = planLook(items, lookById('golden-hour')!);
assert.equal(first.clips, 2, 'only video and photo clips');
assert.deepEqual(first.actions.map((a) => (a as { id: string }).id), ['a', 'b']);
const bEffects = (first.actions[1] as unknown as { effects: Array<{ id: string }> }).effects;
assert.equal(bEffects[0]!.id, 'fx_mine', 'hand-added effect stays, in front');
assert.ok(bEffects.slice(1).every((e) => isLookEffect(e as never)) && !bEffects.some((e) => e.id === 'look_old-film_0'), 'the earlier look is replaced');
const cleared = planLook(items, null);
assert.deepEqual((cleared.actions[1] as unknown as { effects: Array<{ id: string }> }).effects.map((e) => e.id), ['fx_mine'], 'none keeps hand-added effects only');
assert.equal(planLook(items, lookById('retro-vhs')!, ['b']).clips, 1, 'scope: one clip');

// the agent tool: one undo step, scope and errors
const deps: ReelsDeps = { api: {} as never, recipes: [], kv: { get: async () => undefined, set: async () => undefined } };
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
for (const [id, start] of [['v1', 0], ['v2', 60]] as const) h = historyReduce(h, { type: 'add', startFrame: start, item: { id, track: 'V1', kind: 'video', name: id, src: `/${id}.mp4`, durationInFrames: 60 } } as never);
let selectedId: string | null = null;
const ctx: AgentContext = {
  commands: { batch: (actions: AtomicAction[], label?: string) => { h = historyReduce(h, { type: 'batch', label, actions }); } } as never,
  getState: () => ({ ...activeTimeline(h.present), selectedId }), getDoc: () => h.present, getCreativeMode: () => null, templates: [], audio: [], getProjectId: () => 'p',
};
const fxOf = (id: string) => (activeTimeline(h.present).items.find((i) => i.id === id)?.effects ?? []).map((e) => e.assetId);
assert.ok(((await execReelsTool('reels_apply_look', { look: 'nope' }, ctx, deps)) as { error?: string }).error);
assert.match(((await execReelsTool('reels_apply_look', { look: 'retro-vhs', scope: 'selected' }, ctx, deps)) as { error?: string }).error ?? '', /selected/);
const before = h.past.length;
const done = await execReelsTool('reels_apply_look', { look: 'neon-night' }, ctx, deps) as { ok?: boolean; clips: number };
assert.ok(done.ok && done.clips === 2);
assert.equal(h.past.length, before + 1, 'one undo step');
assert.ok(fxOf('v1').includes('builtin:fx-anamorphic-flare') && fxOf('v2').includes('builtin:fx-anamorphic-flare'));
selectedId = 'v2';
await execReelsTool('reels_apply_look', { look: 'old-film', scope: 'selected' }, ctx, deps);
assert.ok(fxOf('v2').includes('builtin:fx-film-damage') && !fxOf('v2').includes('builtin:fx-anamorphic-flare'), 'the new look replaced the old one on the selected clip');
assert.ok(fxOf('v1').includes('builtin:fx-anamorphic-flare'), 'the other clip keeps its look');
await execReelsTool('reels_apply_look', { look: 'none' }, ctx, deps);
assert.deepEqual([fxOf('v1'), fxOf('v2')], [[], []], 'none removes the looks');
h = historyReduce(h, { type: 'undo' } as never);
assert.ok(fxOf('v1').length > 0, 'undo brings the look back in one step');
console.log('looks.verify ok');
