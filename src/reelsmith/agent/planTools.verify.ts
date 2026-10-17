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
const photos = Array.from({ length: 6 }, (_, i) => (i < 2 ? { ...asset(`p${i}`, 'image', 150), width: 600, height: 800 } : asset(`p${i}`, 'image', 150))); // p0 and p1 are small
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
const opts = await execReelsTool('reels_plan_options', {}, ctx, deps) as { assets: Array<{ assetId: string; kind: string; orientation?: string }>; recipes: Array<{ id: string; needsBeat: boolean; inputs: Array<{ id: string; maxLength?: number }>; ratios: string[] }>; timelineIsEmpty: boolean };
assert.equal(opts.assets.length, 21);
assert.equal(opts.assets.find((a) => a.assetId === 'c0')!.orientation, 'portrait');
assert.deepEqual(opts.recipes.map((r) => r.id), ['travel-diary', 'photo-dump']);
assert.ok(opts.recipes[0]!.inputs.some((i) => i.id === 'line' && i.maxLength));
assert.equal(opts.timelineIsEmpty, true);
assert.deepEqual(opts.recipes.map((r) => r.needsBeat), [true, false], 'travel-diary needs a beat, photo-dump does not');
assert.equal((opts.assets.find((a) => a.assetId === 'song') as { beat?: string }).beat, 'steady');
assert.equal((opts.assets.find((a) => a.assetId === 'c0') as { beat?: string }).beat, undefined, 'only songs get a beat check');

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

// enhanceSmallPhotos reaches the setup as the enhancement param: the photos that need it go through api.upscale, the rest do not
const upscaled: string[] = [];
const enhDeps: ReelsDeps = { ...deps, api: { ...api, upscale: async (a) => { upscaled.push(a.id); return { src: `${a.src}.x2.jpg`, width: (a.width ?? 0) * 2, height: (a.height ?? 0) * 2 }; } } };
await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump', replaceTimeline: true, media: { clips: photos.map((p) => p.id) } }, ctx, enhDeps);
assert.equal(upscaled.length, 0, 'not asked: nothing is enhanced');
const enhanced = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump', replaceTimeline: true, enhanceSmallPhotos: true, media: { clips: photos.map((p) => p.id) } }, ctx, enhDeps) as { ok?: boolean; error?: string };
assert.ok(enhanced.ok, enhanced.error);
assert.deepEqual([...upscaled].sort(), ['p0', 'p1'], 'only the two small photos are sent');

// too little footage is explained, not built
const few = emptyProjectDoc();
let h2: History = { past: [], present: few, future: [] };
h2 = historyReduce(h2, { type: 'batch', label: 'pool', actions: photos.slice(0, 2).map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
const ctx2: AgentContext = { ...ctx, getState: () => activeTimeline(h2.present), getDoc: () => h2.present };
const short = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump' }, ctx2, deps) as { error?: string };
assert.match(short.error ?? '', /at least/);

// a song without a beat: a beat recipe is refused with the beat-free choices, or falls back in the same call
const deafDeps: ReelsDeps = { ...deps, api: { ...api, musicGrid: async () => null } };
const deafOpts = await execReelsTool('reels_plan_options', {}, ctx2, deafDeps) as { assets: Array<{ assetId: string; beat?: string }> };
assert.equal(deafOpts.assets.find((a) => a.assetId === 'song'), undefined, 'ctx2 has no song');
h2 = historyReduce(h2, { type: 'batch', label: 'song', actions: [{ type: 'addAsset', asset: song } as AtomicAction, ...clips.slice(0, 8).map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)), ...photos.slice(2).map((a) => ({ type: 'addAsset', asset: a } as AtomicAction))] });
assert.equal(((await execReelsTool('reels_plan_options', {}, ctx2, deafDeps)) as typeof deafOpts).assets.find((a) => a.assetId === 'song')!.beat, 'none');
const noBeat = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary' }, ctx2, deafDeps) as { error?: string };
assert.match(noBeat.error ?? '', /photo-dump/);
assert.match(noBeat.error ?? '', /fallbackRecipeId/);
const fell = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary', fallbackRecipeId: 'photo-dump' }, ctx2, deafDeps) as { ok?: boolean; error?: string; recipe?: string; fellBackFrom?: string };
assert.ok(fell.ok, fell.error);
assert.equal(fell.fellBackFrom, 'travel-diary');
const badFallback = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary', fallbackRecipeId: 'travel-diary', replaceTimeline: true }, ctx2, deafDeps) as { error?: string };
assert.match(badFallback.error ?? '', /photo-dump/, 'a beat recipe is not accepted as the fallback');

// length: targetSec is honoured by flexible recipes and reported by fixed ones
const dumpShort = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump', targetSec: 8, replaceTimeline: true }, ctx2, deafDeps) as { ok?: boolean; error?: string; seconds?: number; lengthNote?: string };
assert.ok(dumpShort.ok, dumpShort.error);
assert.ok(dumpShort.seconds! > 0, 'photo-dump built');
if (dumpShort.lengthNote) assert.match(dumpShort.lengthNote, /name about \d+/, 'a missed length says how many photos would fit');
const fixedLen = await execReelsTool('reels_plan_options', {}, ctx2, deps) as { recipes: Array<{ id: string; lengthFixed: boolean }> };
assert.deepEqual(fixedLen.recipes.map((r) => r.lengthFixed), [true, false]);

// library songs: listed with their beat, and added by the plan itself when a recipe needs one and none is imported
const lib = [{ id: 'aud_a', name: 'Calm Groove', category: 'music' as const, src: '/audio/a.mp3', durationInFrames: 600 }, { id: 'aud_v', name: 'Voice', category: 'voice' as const, src: '/audio/v.mp3', durationInFrames: 600 }];
let h3: History = { past: [], present: emptyProjectDoc(), future: [] };
h3 = historyReduce(h3, { type: 'batch', label: 'pool', actions: [...clips, ...photos].map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
const ctx3: AgentContext = { ...ctx, audio: lib, commands: { batch: (actions: AtomicAction[], label?: string) => { h3 = historyReduce(h3, { type: 'batch', label, actions }); } } as never, getState: () => activeTimeline(h3.present), getDoc: () => h3.present };
const o3 = await execReelsTool('reels_plan_options', {}, ctx3, deps) as { libraryMusic: Array<{ id: string; beat?: string }> };
assert.deepEqual(o3.libraryMusic.map((m) => [m.id, m.beat]), [['aud_a', 'steady']], 'voice tracks are not music');
assert.match(((await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary', music: 'No Such Song' }, ctx3, deps)) as { error?: string }).error ?? '', /unknown music/);
const auto = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary' }, ctx3, deps) as { ok?: boolean; error?: string; music?: string; musicAdded?: boolean };
assert.ok(auto.ok, auto.error);
assert.equal(auto.music, 'Calm Groove');
assert.ok(auto.musicAdded);
assert.ok((h3.present.assets ?? []).some((a) => a.id === 'aud_a'), 'the song is in the project');
assert.equal(activeTimeline(h3.present).items.filter((i) => i.kind === 'audio').length, 1);
const beforeUndo = h3.past.length;
h3 = historyReduce(h3, { type: 'undo' });
assert.equal(activeTimeline(h3.present).items.length, 0, 'one undo removes the reel and the song together');
assert.equal(h3.past.length, beforeUndo - 1);
// beatless library song: a beat recipe is not forced onto it
const deafLib: ReelsDeps = { ...deps, api: { ...api, musicGrid: async () => null } };
const none = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary', replaceTimeline: true }, ctx3, deafLib) as { error?: string };
assert.ok(none.error, 'no song with a beat: refused with a reason');

// length: a photo reel asked for 10 s shows a subset of the photos that fits
h3 = historyReduce(h3, { type: 'batch', label: 'more photos', actions: Array.from({ length: 14 }, (_, i) => ({ type: 'addAsset', asset: asset(`q${100 + i}`, 'image', 150) } as AtomicAction)) });
const ten = await execReelsTool('reels_plan_assemble', { recipeId: 'photo-dump', targetSec: 10, replaceTimeline: true, params: { cutRule: 'every2Beats' } }, ctx3, deps) as { ok?: boolean; error?: string; seconds?: number; trimmedToPhotos?: number };
assert.ok(ten.ok, ten.error);
assert.ok(Math.abs(ten.seconds! - 10) <= 1.5, `asked 10 s, got ${ten.seconds}`);
assert.ok(ten.trimmedToPhotos && ten.trimmedToPhotos < 20, 'a subset was shown');

// two library songs: the one nearest a reel-friendly tempo is the automatic choice, and options show each tempo
const tempo = (bpm: number) => Array.from({ length: 40 }, (_, i) => i * (60 / bpm));
const bpmApi: AnalyzeApi = { ...api, musicGrid: async (a) => ({ durationSec: 20, beatTimesSec: tempo(a.id === 'aud_slow' ? 72 : 118), beatsPerBar: 4, downbeatIndex: 0 }) };
const twoSongs = [{ id: 'aud_slow', name: 'Slow', category: 'music' as const, src: '/audio/s.mp3', durationInFrames: 600 }, { id: 'aud_mid', name: 'Mid', category: 'music' as const, src: '/audio/m.mp3', durationInFrames: 600 }];
let h4: History = { past: [], present: emptyProjectDoc(), future: [] };
h4 = historyReduce(h4, { type: 'batch', label: 'pool', actions: clips.map((a) => ({ type: 'addAsset', asset: a } as AtomicAction)) });
const ctx4: AgentContext = { ...ctx, audio: twoSongs, commands: { batch: (actions: AtomicAction[], label?: string) => { h4 = historyReduce(h4, { type: 'batch', label, actions }); } } as never, getState: () => activeTimeline(h4.present), getDoc: () => h4.present };
const deps4: ReelsDeps = { ...deps, api: bpmApi };
const o4 = await execReelsTool('reels_plan_options', {}, ctx4, deps4) as { libraryMusic: Array<{ id: string; bpm?: number }> };
assert.deepEqual(o4.libraryMusic.map((m) => [m.id, m.bpm]), [['aud_slow', 72], ['aud_mid', 118]]);
const tempoPick = await execReelsTool('reels_plan_assemble', { recipeId: 'travel-diary' }, ctx4, deps4) as { ok?: boolean; error?: string; music?: string };
assert.ok(tempoPick.ok, tempoPick.error);
assert.equal(tempoPick.music, 'Mid', 'the 118 bpm song, not the 72 bpm one');
console.log('planTools verify ok');
