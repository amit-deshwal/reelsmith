import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce, type History } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';

const recipe = (() => {
  const r = parseRecipe(readFileSync('recipes/travel-beat-montage.recipe.json', 'utf8'));
  assert.ok(r.ok);
  return r.recipe;
})();

// 120 bpm => 0.5 s per beat, 4 beats per bar, 60 s of music.
const music: AssemblyMusic = {
  assetId: 'song', name: 'song.mp3', src: '/media/uploads/song.mp3', durationSec: 60,
  beatTimesSec: Array.from({ length: 120 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const clips = (n: number, withDupes = false): AssemblyClip[] => Array.from({ length: n }, (_, i) => ({
  assetId: `c${i}`, name: `clip${i}.mov`, src: `/media/uploads/c${i}.mov`, kind: 'video' as const,
  durationInFrames: 300, score: ((i * 37) % 11) / 11, captureTimeMs: 1_700_000_000_000 + i * 60_000,
  groupId: withDupes && i % 4 === 1 ? `g${i - 1}` : (withDupes && i % 4 === 0 ? `g${i}` : undefined),
}));
const base = { recipe, music, texts: { place: 'Test' }, params: { cutRule: 'every2Beats' }, seed: 7 };

// 1. determinism: identical output for identical inputs
const a = assemble({ ...base, clips: clips(40) });
const b = assemble({ ...base, clips: clips(40) });
assert.ok(a.action);
assert.equal(JSON.stringify(a), JSON.stringify(b), 'same inputs => identical result');
const c = assemble({ ...base, clips: clips(40), seed: 8 });
assert.ok(c.action);

// 2. no repeated clips, and it lands on a bar boundary
const used = a.report.usedAssetIds;
assert.equal(new Set(used).size, used.length, 'no repeated clips');
const barFrames = 4 * 0.5 * 30;
assert.equal(a.report.totalFrames % barFrames, 0, 'reel ends on a bar');
assert.ok(a.report.totalFrames <= (recipe.duration?.maxSec ?? 45) * 30 + 1);

// 3. one undo step
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
const h0: History = { past: [], present: doc, future: [] };
const h1 = historyReduce(h0, a.action!);
assert.equal(h1.past.length, 1, 'assembly is one history entry');
assert.ok(h1.present.timelines[0]!.items.length > 5);
const h2 = historyReduce(h1, { type: 'undo' });
assert.equal(h2.present.timelines[0]!.items.length, 0, 'one undo removes the whole assembly');

// 4. near-duplicates: never two clips from one group
const d = assemble({ ...base, clips: clips(40, true) });
const groupOf = new Map(clips(40, true).map((x) => [x.assetId, x.groupId]));
const groups = d.report.usedAssetIds.map((id) => groupOf.get(id)).filter(Boolean);
assert.equal(new Set(groups).size, groups.length, 'at most one clip per near-duplicate group');

// 5. short footage: shots lengthen instead of repeating
const few = assemble({ ...base, clips: clips(8) });
assert.ok(few.action);
assert.equal(new Set(few.report.usedAssetIds).size, few.report.usedAssetIds.length);
assert.ok(few.report.warnings.some((w) => /lengthened/.test(w)));
assert.ok(few.report.shots <= 8);

// 6. no music => nothing, with a reason
const nm = assemble({ ...base, music: undefined, clips: clips(10) });
assert.equal(nm.action, null);
assert.ok(nm.report.warnings.length > 0);

// 7. chronological order is kept
const order = a.report.usedAssetIds.map((id) => Number(id.slice(1)));
assert.deepEqual(order, [...order].sort((x, y) => x - y), 'chronological');

console.log('assembler.verify: ok');
