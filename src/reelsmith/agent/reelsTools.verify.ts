import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import type { AgentContext } from '../../agent/context';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import type { AtomicAction } from '../../editor/reducerActions';
import { activeTimeline, type MediaAsset } from '../../editor/types';
import type { AnalyzeApi } from '../runRecipe';
import { runRecipe } from '../runRecipe';
import { saveRun } from '../runStore';
import { defaultValues } from '../setupForm';
import { bindTracks } from '../trackBinding';
import { execReelsTool, isRecipeItem, type ReelsDeps } from './reelsTools';

const r = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;
const asset = (id: string, kind: MediaAsset['kind'], frames = 300): MediaAsset => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames });
const assets = [...Array.from({ length: 14 }, (_, i) => asset(`c${i}`, 'video')), asset('song', 'audio', 3600)];
// distinct 64-bit perceptual hashes so no two fake clips count as near-duplicates
const hash = (id: string) => { const n = Number(id.slice(1)) || 0; return (((n + 1) * 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + (((n + 7) * 0x85ebca6b) >>> 0).toString(16).padStart(8, '0'); };
let gridCalls = 0;
const api: AnalyzeApi = {
  clipFeatures: async (a) => ({ assetId: a.id, dHash: hash(a.id), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.3 + (Number(a.id.slice(1)) % 5) / 10, exposure: 0.7, motion: 0.4, subject: 0, speech: false }] }),
  musicGrid: async () => { gridCalls++; return { durationSec: 120, beatTimesSec: Array.from({ length: 240 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }; },
};
const store = new Map<string, unknown>();
const deps: ReelsDeps = { api, recipes: [recipe], kv: { get: async <T>(k: string) => store.get(k) as T | undefined, set: async (k, v) => { store.set(k, v); } } };

// a project with the media pool and an assembled reel, plus one clip the user added by hand
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'pool', actions: assets.map((a) => ({ type: 'addAsset', asset: a })) });
const values = defaultValues(recipe);
values.media.clips = assets.filter((a) => a.kind === 'video').map((a) => ({ assetId: a.id, kind: 'video' as const }));
values.media.music = [{ assetId: 'song', kind: 'audio' }];
values.texts.place = 'Pune';
const out = await runRecipe(api, { recipe, values, assets, fps: 30, replaceTimeline: true, seed: 3 });
assert.ok(out.action);
h = historyReduce(h, bindTracks(out.action!, activeTimeline(h.present)));
assert.ok(out.result.report.shots >= 8, `assembled ${out.result.report.shots} shots`);
h = historyReduce(h, { type: 'add', item: { id: 'mine', track: activeTimeline(h.present).items.find((i) => i.kind === 'text')!.track, kind: 'text', name: 'mine', durationInFrames: 30, props: { text: 'hi' } } as never, startFrame: 0 });
await saveRun(deps.kv, 'p1', out.run);
assert.deepEqual(out.run.media?.clips?.length, 14, 'run keeps the media per input');

const ctx: AgentContext = {
  commands: { batch: (actions: AtomicAction[], label?: string) => { h = historyReduce(h, { type: 'batch', label, actions }); } } as never,
  getState: () => activeTimeline(h.present),
  getDoc: () => h.present,
  getCreativeMode: () => null,
  templates: [], audio: [],
  getProjectId: () => 'p1',
};
const tl = () => activeTimeline(h.present);

// the music clip carries the beat grid
const music = tl().items.find((i) => i.kind === 'audio')!;
assert.ok((music.props as { rsBeats?: unknown }).rsBeats, 'beat grid stored on the music clip');

// run info
const info = await execReelsTool('reels_run_info', {}, ctx, deps) as { run: { recipeId: string }; sections: Record<string, number> };
assert.equal(info.run.recipeId, recipe.id);
const sectionNames = Object.keys(info.sections);
assert.ok(sectionNames.length >= 1, JSON.stringify(info.sections));

// re-cut one section: one undo step, other sections and manual items untouched
const target = sectionNames.find((s) => info.sections[s]! >= 2) ?? sectionNames[0]!;
const otherBefore = tl().items.filter((i) => (i.props as { rsSection?: string })?.rsSection && (i.props as { rsSection?: string }).rsSection !== target).map((i) => i.id).sort();
const pastBefore = h.past.length;
const recut = await execReelsTool('reels_recut_section', { section: target, seed: 99 }, ctx, deps) as { ok?: boolean; error?: string };
assert.ok(recut.ok, recut.error);
assert.equal(h.past.length, pastBefore + 1, 're-cut is one undo step');
assert.ok(tl().items.some((i) => i.id === 'mine'), 'manual item kept');
const otherAfter = tl().items.filter((i) => (i.props as { rsSection?: string })?.rsSection && (i.props as { rsSection?: string }).rsSection !== target).map((i) => i.id).sort();
assert.deepEqual(otherAfter, otherBefore, 'other sections untouched');
assert.ok((await execReelsTool('reels_recut_section', { section: 'nope' }, ctx, deps) as { error?: string }).error);
h = historyReduce(h, { type: 'undo' });

// snap cuts to beats uses the stored grid (no re-analysis) and is one undo step
gridCalls = 0;
const snapPast = h.past.length;
const snap = await execReelsTool('reels_snap_cuts_to_beats', { every: 2 }, ctx, deps) as { ok?: boolean; error?: string };
assert.ok(snap.ok, snap.error);
assert.equal(gridCalls, 0, 'stored grid reused');
assert.ok(h.past.length <= snapPast + 1);
// without a stored grid the song is analysed once and the grid saved in the same step
h = historyReduce(h, { type: 'updateProps', id: music.id, patch: { rsBeats: undefined } });
const snap2 = await execReelsTool('reels_snap_cuts_to_beats', {}, ctx, deps) as { ok?: boolean };
assert.ok(snap2.ok);
assert.equal(gridCalls, 1);
assert.ok((tl().items.find((i) => i.id === music.id)!.props as { rsBeats?: unknown }).rsBeats, 'grid saved');

// selection candidates + propose_selection
const cand = await execReelsTool('reels_selection_candidates', {}, ctx, deps) as { selectionKey: string; slots: number; candidates: Array<{ assetId: string }> };
assert.ok(cand.slots > 0 && cand.candidates.length === 14);
const picks = [...cand.candidates.map((c) => c.assetId)].reverse().slice(0, cand.slots);
const bad = ['ghost', picks[0], picks[0]];
const res = await execReelsTool('propose_selection', { selectionKey: cand.selectionKey, assetIds: [...bad, ...picks.slice(1)] }, ctx, deps) as { ok?: boolean; rejected: Array<{ reason: string }>; accepted: number };
assert.ok(res.ok);
assert.ok(res.rejected.some((x) => x.reason === 'unknown asset') && res.rejected.some((x) => x.reason === 'repeated'), 'malformed picks rejected');
const v1 = tl().items.filter((i) => isRecipeItem(i.id) && i.kind === 'video').sort((a, b) => a.startFrame - b.startFrame);
assert.equal(v1[0]!.sourceAssetId, picks[0], 'first shot is the agent\'s first pick');
assert.ok(tl().items.some((i) => i.id === 'mine'), 'manual item kept after re-assembly');
assert.equal(tl().items.filter((i) => i.kind === 'audio').length, 1, 'no duplicate music');
// garbage answer still assembles (heuristic fills)
const freshCand = await execReelsTool('reels_selection_candidates', {}, ctx, deps) as { selectionKey: string };
const junk = await execReelsTool('propose_selection', { selectionKey: freshCand.selectionKey, assetIds: 'all of them' }, ctx, deps) as { ok?: boolean; filledByHeuristic: number };
assert.ok(junk.ok && junk.filledByHeuristic > 0);

// one contact sheet of the best candidates: numbered legend, one call, respects frame sharing, same selectionKey as the candidates
{
  const memory = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  const { setFramesAllowed } = await import('../framePrivacy');
  const sheetCalls: Array<Array<{ id: string; label: string }>> = [];
  const sheetApi: AnalyzeApi = { ...api, selectionSheet: async (items) => {
    sheetCalls.push(items.map((x) => ({ id: x.asset.id, label: x.label })));
    return { sheets: [{ base64: 'AAAA', labels: items.map((x) => x.label) }], skipped: [] };
  } };
  const sheetDeps: ReelsDeps = { ...deps, api: sheetApi };
  setFramesAllowed('p1', false);
  assert.match((await execReelsTool('reels_selection_sheet', {}, ctx, sheetDeps) as { error: string }).error, /Frame sharing is off/);
  assert.equal(sheetCalls.length, 0, 'no frames are cut while sharing is off');
  setFramesAllowed('p1', true);
  assert.match((await execReelsTool('reels_selection_sheet', {}, ctx, deps) as { error: string }).error, /not available/, 'no sheet builder: points back to the table');
  const c = await execReelsTool('reels_selection_candidates', {}, ctx, sheetDeps) as { selectionKey: string; hint: string; candidates: Array<{ inspect?: unknown }> };
  assert.match(c.hint, /reels_selection_sheet/);
  assert.ok(c.candidates.every((x) => x.inspect === undefined), 'no per-clip inspect requests any more');
  const sheet = await execReelsTool('reels_selection_sheet', {}, ctx, sheetDeps) as { __images: unknown[]; selectionKey: string; slots: number; legend: Array<{ n: number; assetId: string; score: number }> };
  assert.equal(sheetCalls.length, 1, 'a single sheet request');
  assert.equal(sheet.__images.length, 1);
  assert.equal(sheet.selectionKey, c.selectionKey, 'same key, so propose_selection accepts it');
  assert.ok(sheet.legend.length === 14 && sheet.legend.every((x, i) => x.n === i + 1 && (i === 0 || x.score <= sheet.legend[i - 1]!.score)), 'legend numbered, best first');
  assert.deepEqual(sheetCalls[0]!.map((x) => x.label), sheet.legend.map((x) => String(x.n)), 'cell labels match the legend');
  setFramesAllowed('p1', false);
}

// the agent can set the recipe's text in the same rebuild, even with no shot picks
{
  const c = await execReelsTool('reels_selection_candidates', {}, ctx, deps) as { selectionKey: string; textInputs: Array<{ id: string; value: string; maxLength?: number }> };
  assert.deepEqual(c.textInputs.map((t) => [t.id, t.value, t.maxLength]), [['place', 'Pune', 40]], 'candidates list the text inputs');
  const past = h.past.length;
  const set = await execReelsTool('propose_selection', {
    selectionKey: c.selectionKey, assetIds: [], texts: { place: 'Lonavala', ghost: 'x' }, rationale: 'place name',
  }, ctx, deps) as { ok?: boolean; texts?: Record<string, string>; rejected: Array<{ value: unknown; reason: string }> };
  assert.ok(set.ok);
  assert.deepEqual(set.texts, { place: 'Lonavala' });
  assert.ok(set.rejected.some((x) => x.value === 'ghost' && /not a text input/.test(x.reason)));
  assert.equal(h.past.length, past + 1, 'one undo step');
  assert.ok(tl().items.some((i) => i.kind === 'text' && /LONAVALA/i.test(String((i.props as { text?: string }).text))), 'title uses the new text');
  assert.ok(!tl().items.some((i) => i.kind === 'text' && /PUNE/i.test(String((i.props as { text?: string }).text))), 'old title gone');
  const info2 = await execReelsTool('reels_run_info', {}, ctx, deps) as { run: { texts: Record<string, string> } };
  assert.equal(info2.run.texts.place, 'Lonavala', 'saved with the run');
  const c2 = await execReelsTool('reels_selection_candidates', {}, ctx, deps) as { selectionKey: string };
  const long = await execReelsTool('propose_selection', { selectionKey: c2.selectionKey, assetIds: [], texts: { place: 'x'.repeat(41) } }, ctx, deps) as { keptExisting?: boolean; rejected: Array<{ reason: string }> };
  assert.ok(long.keptExisting && long.rejected.some((x) => /longer than 40/.test(x.reason)), 'too long: refused, reel kept');
}

// no run saved => clear error
store.clear();
assert.match((await execReelsTool('reels_selection_candidates', {}, ctx, deps) as { error: string }).error, /not built by a recipe/);
console.log('reelsTools.verify ok');

// lint: a 9:16 reel built by a recipe has no errors; a gap is an error; text in the UI band is a warning
{
  const { lintReel } = await import('../reelLint');
  const clean = lintReel(tl());
  assert.equal(clean.errors, 0, JSON.stringify(clean.issues));
  const v1 = tl().items.filter((i) => isRecipeItem(i.id) && i.kind === 'video').sort((a, b) => a.startFrame - b.startFrame);
  const st = { ...tl(), items: tl().items.filter((i) => i.id !== v1[1]!.id).concat([{ id: 'low', track: tl().items.find((i) => i.id === 'mine')!.track, kind: 'text', name: 'low', startFrame: 0, durationInFrames: 30, props: { text: 'Subscribe', fontSize: 80 }, transform: { y: 45 } } as never]) };
  const bad = lintReel(st);
  assert.ok(bad.issues.some((i) => i.level === 'error' && /gap/.test(i.message)));
  assert.ok(bad.issues.some((i) => /Instagram UI/.test(i.message)));
  assert.ok(lintReel({ ...st, width: 1920, height: 1080 }).issues.some((i) => /not 9:16/.test(i.message)));
  console.log('reelLint ok');
}
