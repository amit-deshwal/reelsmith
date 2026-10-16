import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseRecipe, type Recipe } from '../../../shared/reelsmith/recipe';
import type { AgentContext } from '../../agent/context';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import type { AtomicAction } from '../../editor/reducerActions';
import { activeTimeline, type MediaAsset } from '../../editor/types';
import { runRecipe, type AnalyzeApi } from '../runRecipe';
import { loadRun, saveRun } from '../runStore';
import { defaultValues } from '../setupForm';
import { bindTracks } from '../trackBinding';
import { framesAllowed, setFramesAllowed } from '../framePrivacy';
import { selectionSnapshot } from './selectionContext';
import { execReelsTool, type ReelsDeps } from './reelsTools';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value),
} });
const api: AnalyzeApi = {
  clipFeatures: async (asset) => ({ assetId: asset.id, dHash: createHash('sha256').update(asset.id).digest('hex').slice(0, 16),
    windows: [{ startFrame: 0, endFrame: asset.durationInFrames, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0.1, speech: !!asset.transcript?.length }] }),
  musicGrid: async () => ({ durationSec: 120, beatTimesSec: Array.from({ length: 240 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
};
interface Candidates { selectionKey: string; slots: number; brollSlots: number; candidates: Array<{ assetId: string; inspect?: unknown }>; brollCandidates: Array<{ assetId: string }>; framesAllowed: boolean }
interface Applied { ok?: boolean; error?: string; acceptedAssetIds: string[]; acceptedBrollAssetIds: string[]; filledByHeuristic: number; keptExisting?: boolean; warnings: string[]; rationale: string }

async function harness(recipeId: string) {
  const parsed = parseRecipe(readFileSync(`recipes/${recipeId}.recipe.json`, 'utf8'));
  assert.ok(parsed.ok);
  const recipe: Recipe = parsed.recipe;
  const values = defaultValues(recipe);
  const assets: MediaAsset[] = [];
  for (const input of recipe.inputs) {
    if (input.kind === 'text') { values.texts[input.id] = 'Fixture'; continue; }
    const kind = input.accept.includes('video') ? 'video' : input.accept[0]!;
    const count = kind === 'audio' ? 1 : recipeId === 'captioned-story' && input.id === 'talking' ? 2 : Math.min(40, input.max);
    values.media[input.id] = [];
    for (let i = 0; i < count; i += 1) {
      const id = `${input.id}-${i}`;
      const asset: MediaAsset = { id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: 3600,
        ...(input.id === 'talking' ? { transcript: Array.from({ length: 48 }, (_, k) => ({ text: `word${k}${k % 4 === 3 ? '.' : ''}`, start: 500 + k * 500, end: 800 + k * 500 })) } : {}) };
      assets.push(asset); values.media[input.id]!.push({ assetId: id, kind });
    }
  }
  const store = new Map<string, unknown>();
  const deps: ReelsDeps = { api, recipes: [recipe], kv: { get: async <T>(key: string) => store.get(key) as T | undefined,
    set: async (key, value) => { store.set(key, value); } } };
  let history: History = { past: [], present: emptyProjectDoc(), future: [] };
  history = historyReduce(history, { type: 'batch', actions: assets.map((asset) => ({ type: 'addAsset', asset })) });
  const out = await runRecipe(api, { recipe, values, assets, fps: 30, replaceTimeline: true });
  assert.ok(out.action, `${recipeId}: ${out.messages}`);
  history = historyReduce(history, bindTracks(out.action, activeTimeline(history.present)));
  history = historyReduce(history, { type: 'add', item: { id: 'rs-manual-note', track: activeTimeline(history.present).trackOrder![0]!,
    kind: 'text', name: 'My note', durationInFrames: 30, props: { text: 'Keep me' } } as never, startFrame: 0 });
  await saveRun(deps.kv, recipeId, out.run);
  const ctx: AgentContext = { getProjectId: () => recipeId, getDoc: () => history.present, getState: () => activeTimeline(history.present),
    commands: { batch: (actions: AtomicAction[], label?: string) => { history = historyReduce(history, { type: 'batch', label, actions }); } } as never,
    getCreativeMode: () => null, templates: [], audio: [] };
  return { ctx, deps, history: () => history, mutate: () => { history = historyReduce(history, { type: 'updateProps', id: 'rs-manual-note', patch: { text: 'Edited while choosing' } }); } };
}

for (const id of ['travel-beat-montage', 'beat-cut', 'mini-vlog', 'collage-grid', 'captioned-story']) {
  const h = await harness(id);
  const candidates = await execReelsTool('reels_selection_candidates', {}, h.ctx, h.deps) as Candidates;
  assert.ok(candidates.selectionKey && candidates.slots > 0, id);
  assert.equal(candidates.framesAllowed, true);
  assert.ok(candidates.candidates.every((candidate) => candidate.inspect), 'contact-sheet requests are supplied');
  const picks = [...candidates.candidates].reverse().slice(0, candidates.slots).map((candidate) => candidate.assetId);
  const broll = [...candidates.brollCandidates].reverse().slice(0, candidates.brollSlots).map((candidate) => candidate.assetId);
  if (id === 'mini-vlog') assert.ok(candidates.slots > 15, 'split-screen clips count separately from timeline slots');
  if (id === 'captioned-story') assert.ok(broll.length > 0, 'separate B-roll slots are available');
  const before = h.history();
  const result = await execReelsTool('propose_selection', { selectionKey: candidates.selectionKey, assetIds: picks, brollAssetIds: broll, rationale: 'Varied opener and ending.' }, h.ctx, h.deps) as Applied;
  assert.ok(result.ok, `${id}: ${result.error ?? JSON.stringify(result)}`);
  assert.deepEqual(result.acceptedAssetIds, picks, `${id} honours primary choices`);
  assert.deepEqual(result.acceptedBrollAssetIds, broll, `${id} honours B-roll choices`);
  assert.equal(h.history().past.length, before.past.length + 1, 'exactly one undo step');
  const timeline = h.ctx.getState();
  const first = timeline.items.filter((item) => item.sourceAssetId && picks.includes(item.sourceAssetId)).sort((a, b) => a.startFrame - b.startFrame)[0]!;
  assert.equal(first.sourceAssetId, picks[0], `${id}: first agent pick is placed first`);
  assert.ok(timeline.items.some((item) => item.id === 'rs-manual-note'), 'manual item with rs prefix survives');
  assert.equal(new Set(timeline.items.map((item) => item.id)).size, timeline.items.length);
  assert.equal(timeline.items.filter((item) => item.kind === 'audio').length, 1, 'music is not duplicated');
  assert.deepEqual(historyReduce(h.history(), { type: 'undo' }).present, before.present, 'undo restores original timeline and manual items');
  assert.equal((await loadRun(h.deps.kv, id))!.selectionRationale, result.rationale);

  const fresh = await execReelsTool('reels_selection_candidates', {}, h.ctx, h.deps) as Candidates;
  const partial = await execReelsTool('propose_selection', { selectionKey: fresh.selectionKey, assetIds: [picks[0], 'unknown', picks[0]] }, h.ctx, h.deps) as Applied & { rejected: Array<{ reason: string }> };
  assert.ok(partial.ok && partial.filledByHeuristic > 0, 'partial answers are filled automatically');
  assert.ok(partial.rejected.some((pick) => pick.reason === 'unknown asset') && partial.rejected.some((pick) => pick.reason === 'repeated'));
  const current = await execReelsTool('reels_selection_candidates', {}, h.ctx, h.deps) as Candidates;
  const unchanged = h.history();
  const malformed = await execReelsTool('propose_selection', { selectionKey: current.selectionKey, assetIds: 'everything' }, h.ctx, h.deps) as Applied;
  assert.ok(malformed.ok && malformed.keptExisting && malformed.filledByHeuristic > 0);
  assert.equal(h.history(), unchanged, 'malformed picks do not touch the current reel');
  h.mutate();
  const changed = h.history();
  const stale = await execReelsTool('propose_selection', { selectionKey: current.selectionKey, assetIds: picks }, h.ctx, h.deps) as Applied;
  assert.match(stale.error!, /stale/);
  assert.equal(h.history(), changed, 'stale picks do not overwrite newer edits');
  setFramesAllowed(id, false);
  const privateCandidates = await execReelsTool('reels_selection_candidates', {}, h.ctx, h.deps) as Candidates;
  assert.equal(privateCandidates.framesAllowed, false);
  assert.ok(privateCandidates.candidates.every((candidate) => !candidate.inspect));
  assert.equal(framesAllowed(id), false);
  console.log(`selectionFlow: ${id} ok`);
}

// A user edit that lands while asynchronous analysis runs must not be overwritten.
const concurrent = await harness('travel-beat-montage');
const started = Promise.withResolvers<void>();
const release = Promise.withResolvers<void>();
let first = true;
concurrent.deps.api = { ...api, clipFeatures: async (asset, fps) => {
  if (first) { first = false; started.resolve(); await release.promise; }
  return api.clipFeatures(asset, fps);
} };
const work = execReelsTool('reels_selection_candidates', {}, concurrent.ctx, concurrent.deps);
await started.promise;
concurrent.mutate();
release.resolve();
assert.match((await work as { error: string }).error, /changed during analysis/);
const originalDoc = concurrent.ctx.getDoc();
const withHighlight = { ...originalDoc, timelines: originalDoc.timelines.map((timeline) => ({ ...timeline, selectedId: 'rs-manual-note', selectedIds: ['rs-manual-note'] })) };
assert.equal(selectionSnapshot('p', withHighlight), selectionSnapshot('p', originalDoc), 'selection highlights do not stale the candidate list');
const failedSave = await harness('collage-grid');
const saveCandidates = await execReelsTool('reels_selection_candidates', {}, failedSave.ctx, failedSave.deps) as Candidates;
failedSave.deps.kv.set = async () => { throw new Error('Disk full'); };
const savedTimeline = await execReelsTool('propose_selection', { selectionKey: saveCandidates.selectionKey, assetIds: [saveCandidates.candidates[0]!.assetId] }, failedSave.ctx, failedSave.deps) as Applied;
assert.ok(savedTimeline.ok);
assert.ok(savedTimeline.warnings.some((warning) => /could not be saved/.test(warning)), 'persistence failure reports the already-applied timeline truthfully');
console.log('selectionFlow.verify: ok');
