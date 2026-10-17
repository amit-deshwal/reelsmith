// Plan a reel: reels_plan_options lists media + recipes; reels_plan_assemble builds a reel from a plan in one undo step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import type { AgentContext } from '../../agent/context';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import type { AtomicAction } from '../../editor/reducerActions';
import { activeTimeline, type MediaAsset } from '../../editor/types';
import type { AnalyzeApi } from '../runRecipe';
import { loadRun } from '../runStore';
import { execReelsTool, isRecipeItem, type ReelsDeps } from './reelsTools';

const load = (id: string) => { const r = parseRecipe(readFileSync(`recipes/${id}.recipe.json`, 'utf8')); assert.ok(r.ok); return r.recipe; };
const diary = load('travel-diary');
const dump = load('photo-dump');
const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: `${id}.x`, kind, src: `/media/uploads/${id}`, durationInFrames: frames, ...(kind === 'audio' ? {} : { width: 1080, height: 1920 }) });
const clips = Array.from({ length: 14 }, (_, i) => asset(`c${i}`, 'video'));
const photos = Array.from({ length: 6 }, (_, i) => asset(`p${i}`, 'image', 150));
const song = asset('song', 'audio', 3600);
const hash = (id: string) => { const n = Number(id.slice(1)) || 0; return (((n + 1) * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + (((n + 7) * 0x85ebca6b) >>> 0).toString(16).padStart(8, '0'); };
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: hash(a.id), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.5, exposure: 0.7, motion: 0.4, subject: 0, face: 0, speech: 0 } as never], cuts: [] } as never),
  musicGrid: async () => ({ durationSec: 120, beatTimesSec: Array.from({ length: 240 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};
const store = new Map<string, unknown>();
const deps: ReelsDeps = { api, recipes: [diary, dump], kv: { get: async <T>(k: string) => store.get(k) as T | undefined, set: async (k, v) => { store.set(k, v); } } };

let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'pool', actions: [...clips, ...photos, song].map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
const ctx: AgentContext = {
  commands: { batch: (actions: AtomicAction[], label?: string) => { h = historyReduce(h, { type: 'batch', label, actions }); } } as never,
  getState: () => activeTimeline(h.present), getDoc: () => h.present, getCreativeMode: () => null, templates: [], audio: [], getProjectId: () => 'plan1',
};
const tl = () => activeTimeline(h.present);

// options: media and recipes in one call
const opts = await execReelsTool('reels_plan_options', {}, ctx, deps) as { assets: Array<{ assetId: string; kind: string; orientation?: string }>; recipes: Array<{ id: string; inputs: Array<{ id: string; maxLength?: number }>; ratios: string[] }>; timelineIsEmpty: boolean };
assert.equal(opts.assets.length, 21);
assert.equal(opts.assets.find((a) => a.assetId === 'c0')!.orientation, 'portrait');
assert.deepEqual(opts.recipes.map((r) => r.id), ['travel-diary', 'photo-dump']);
assert.ok(opts.recipes[0]!.inputs.some((i) => i.id === 'line' && i.maxLength));
assert.equal(opts.timelineIsEmpty, true);

// bad plans change nothing
const pastBefore = h.past.length;
for (const bad of [{ recipeId: 'nope' }, { recipeId: 'travel-diary', ratio: '5:4' }, { recipeId: 'travel-diary', media: { clips: ['ghost'] } }, { recipeId: 'travel-diary', media: { bogus: ['c0'] } }]) {
  const r = await execReelsTool('reels_plan_assemble', bad, ctx, deps) as { error?: string };
  assert.ok(r.error, JSON.stringify(bad));
}
assert.equal(h.past.length, pastBefore, 'refused plans leave the project alone');

// a plan builds the reel in one undo step: clips and song filled automatically, text and param applied, run saved
const built = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary', texts: { line: 'Goa / 3 days / 14 clips', nope: 'x' }, seed: 5 }, ctx, deps) as { ok?: boolean; error?: string; rejected?: Array<{ value: unknown }>; usedAssetIds: string[] };
assert.ok(built.ok, built.error);
assert.equal(h.past.length, pastBefore + 1, 'one undo step');
assert.ok(built.rejected?.some((x) => x.value === 'nope'), 'unknown text input reported');
assert.ok(tl().items.some((i) => isRecipeItem(i.id)), 'recipe items on the timeline');
assert.equal(tl().items.filter((i) => i.kind === 'audio').length, 1, 'the only song was used');
assert.ok(built.usedAssetIds.every((id) => id.startsWith('c')), 'photos were not used for a video-and-song recipe');
const run = await loadRun(deps.kv, 'plan1');
assert.equal(run?.recipeId, 'travel-diary');
assert.equal(run?.texts.line, 'Goa / 3 days / 14 clips');
h = historyReduce(h, { type: 'undo' });
assert.equal(tl().items.length, 0, 'undo removes the whole plan');

// an occupied timeline needs the user's say-so
h = historyReduce(h, { type: 'add', item: { id: 'mine', track: 'V1', kind: 'solid', name: 'mine', startFrame: 0, durationInFrames: 30, props: {} } as never });
const refused = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump' }, ctx, deps) as { error?: string };
assert.match(refused.error ?? '', /replaceTimeline/);
const photosPlan = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump', replaceTimeline: true, media: { clips: photos.map((p) => p.id) } }, ctx, deps) as { ok?: boolean; error?: string };
assert.ok(photosPlan.ok, photosPlan.error);
assert.ok(!tl().items.some((i) => i.id === 'mine'), 'replaced');

// too little footage is explained, not built
const few = emptyProjectDoc();
let h2: History = { past: [], present: few, future: [] };
h2 = historyReduce(h2, { type: 'batch', label: 'pool', actions: photos.slice(0, 2).map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
const ctx2: AgentContext = { ...ctx, getState: () => activeTimeline(h2.present), getDoc: () => h2.present };
const short = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump' }, ctx2, deps) as { error?: string };
assert.match(short.error ?? '', /at least/);
console.log('planTools verify ok');
