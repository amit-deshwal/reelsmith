import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../shared/project-version';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { historyReduce, type History } from '../editor/reduce';
import type { ProjectDoc } from '../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './assembler';
import { loadRun, recutSection, saveRun, type Kv } from './runStore';

const parsed = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
assert.ok(parsed.ok);
const recipe = parsed.recipe;
const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 60,
  beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const clips: AssemblyClip[] = Array.from({ length: 60 }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 37) % 11) / 11,
  captureTimeMs: i * 1000,
}));
const input = { recipe, clips, music, texts: {}, params: { cutRule: 'every2Beats' }, seed: 1 };

const mem = new Map<string, unknown>();
const kv: Kv = { get: async (k) => mem.get(k) as never, set: async (k, v) => { mem.set(k, v); } };
const first = assemble(input);
await saveRun(kv, 'p1', first.run);
const loaded = await loadRun(kv, 'p1');
assert.equal(loaded?.recipeId, recipe.id);
assert.equal(loaded?.seed, 1);
assert.equal(await loadRun(kv, 'missing'), null);

const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
let h: History = historyReduce({ past: [], present: doc, future: [] }, first.action!);
// the user adds their own item outside the recipe
h = historyReduce(h, { type: 'add', item: { id: 'manual', track: 'V2', kind: 'text', name: 'mine', durationInFrames: 30 } as any, startFrame: 10 });
const before = h.present.timelines[0]!.items;
const body = (xs: typeof before) => xs.filter((i) => (i.props as any)?.rsSection === 'body');
const other = (xs: typeof before) => xs.filter((i) => (i.props as any)?.rsSection !== 'body').map((i) => JSON.stringify(i)).sort();
assert.ok(body(before).length > 3);

const cut = recutSection(before, input, 'body', 99);
assert.ok(cut);
const pastLen = h.past.length;
h = historyReduce(h, cut!);
assert.equal(h.past.length, pastLen + 1, 're-cut is one undo step');
const after = h.present.timelines[0]!.items;
assert.deepEqual(other(after), other(before), 'everything outside the section, incl. manual edits, is untouched');
assert.equal(body(after).length, body(before).length, 'same number of shots');
assert.notDeepEqual(body(after).map((i) => i.sourceAssetId), body(before).map((i) => i.sourceAssetId), 'new pick');
const outside = new Set(before.filter((i) => (i.props as any)?.rsSection && (i.props as any).rsSection !== 'body').map((i) => i.sourceAssetId));
assert.ok(body(after).every((i) => !outside.has(i.sourceAssetId)), 'no clip reused from other sections');
const starts = (xs: typeof before) => body(xs).map((i) => [i.startFrame, i.durationInFrames].join(':'));
assert.deepEqual(starts(after).sort(), starts(before).sort(), 'section keeps its timing');

// Recipes whose assembler has no section-only mode (story-vlog): a re-cut must not duplicate the song or the labels.
{
  const vr = parseRecipe(readFileSync('recipes/mini-vlog.recipe.json', 'utf8'));
  assert.ok(vr.ok);
  const T0 = Date.UTC(2026, 5, 1, 7, 0);
  const vclips: AssemblyClip[] = Array.from({ length: 24 }, (_, i) => ({
    assetId: `v${i}`, name: `v${i}`, src: `/v${i}`, kind: 'video', durationInFrames: 300, score: ((i * 37) % 11) / 11,
    captureTimeMs: T0 + i * 8 * 60_000,
  }));
  const vinput = { recipe: vr.recipe, clips: vclips, music, texts: { places: 'Home, Cafe' }, params: { labels: 'timeAndPlace', splitEvery: 5, shotLen: 1.6, tzOffsetMin: 0 }, seed: 1 };
  const vfirst = assemble(vinput);
  let vh: History = historyReduce({ past: [], present: { ...doc, timelines: [{ ...doc.timelines[0]!, items: [] } as any] }, future: [] }, vfirst.action!);
  vh = historyReduce(vh, { type: 'add', item: { id: 'mine', track: 'V4', kind: 'text', name: 'mine', durationInFrames: 30 } as any, startFrame: 10 });
  const vbefore = vh.present.timelines[0]!.items;
  const count = (xs: typeof vbefore, kind: string) => xs.filter((i) => i.kind === kind).length;
  const vcut = recutSection(vbefore, vinput, 'body', 7);
  assert.ok(vcut);
  const vpast = vh.past.length;
  vh = historyReduce(vh, vcut!);
  assert.equal(vh.past.length, vpast + 1, 'one undo step');
  const vafter = vh.present.timelines[0]!.items;
  assert.equal(count(vafter, 'audio'), count(vbefore, 'audio'), 'the song is not duplicated');
  assert.equal(count(vafter, 'text'), count(vbefore, 'text'), 'labels are replaced, not duplicated');
  assert.ok(vafter.some((i) => i.id === 'mine'), 'manual item kept');
  assert.equal(vafter.filter((i) => i.kind === 'video').length >= 1, true);
  const ends = (xs: typeof vbefore) => Math.max(...xs.filter((i) => i.kind === 'video' && i.track === 'V1').map((i) => i.startFrame + i.durationInFrames));
  assert.equal(Math.min(...vafter.filter((i) => i.kind === 'video' && i.track === 'V1').map((i) => i.startFrame)), 0, 'still starts at frame 0');
  assert.ok(ends(vafter) > 0);
}
console.log('runStore.verify: ok');
