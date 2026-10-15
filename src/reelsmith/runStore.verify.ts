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
console.log('runStore.verify: ok');
