import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { LAYOUT_SLOTS, withGutter } from './collageGrid';

const r = parseRecipe(readFileSync('recipes/collage-grid.recipe.json', 'utf8'));
assert.ok(r.ok);
const recipe = r.recipe;
const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 60,
  beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0,
};
const clips = (n: number): AssemblyClip[] => Array.from({ length: n }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}.jpg`, kind: 'image', durationInFrames: 1, score: ((i * 5) % 7) / 7,
}));
const base = { recipe, music, texts: { title: 'Pune' }, params: { gutter: 12, radius: 18, bg: '#F4F1EA' }, seed: 2 };

assert.deepEqual(Object.fromEntries(Object.entries(LAYOUT_SLOTS).map(([k, v]) => [k, v.length])),
  { split2v: 2, split2h: 2, split3v: 3, grid2x2: 4, grid3x3: 9 });
const g = withGutter({ x: 0, y: 0, w: 0.5, h: 0.5 }, 20, { width: 1000, height: 2000 });
assert.ok(g.x > 0 && g.w < 0.5);

const res = assemble({ ...base, clips: clips(30) });
assert.ok(res.action);
const acts = res.action!.actions as any[];
const tiles = acts.filter((a) => /^G\d$/.test(a.item?.track ?? ''));
const layouts = [...new Set(tiles.map((a) => a.item.props.rsLayout))];
assert.deepEqual(layouts.slice(0, 4), ['split2v', 'grid2x2', 'split3v', 'grid3x3'].slice(0, layouts.length).slice(0, 4));
assert.equal(layouts[0], 'split2v');
assert.equal(layouts[1], 'grid2x2');
// 18 s target at 0.5 s/beat = 36 beats -> 8 hero + 28 grid = 7 layouts of one bar
assert.equal(res.report.totalFrames, 36 * 15);

// tiles of a layout appear staggered by half a beat (7.5 frames -> 8 / 7)
const firstGrid = tiles.filter((a) => a.item.props.rsLayout === 'grid2x2' && a.startFrame < 120).map((a) => a.startFrame).sort((x, y) => x - y);
assert.equal(firstGrid.length, 4);
assert.ok(firstGrid[1]! > firstGrid[0]! && firstGrid[3]! > firstGrid[2]!, 'staggered reveal');
assert.ok(firstGrid[3]! < 60 + 60, 'all tiles are in by the end of the bar');

// hero ends the reel with the title
const hero = acts.find((a) => a.item?.props?.rsSection === 'hero');
assert.equal(hero.startFrame + hero.item.durationInFrames, res.report.totalFrames);
const title = acts.find((a) => a.item?.kind === 'text');
assert.equal(title.item.props.text, 'Pune');
assert.equal(new Set(res.report.usedAssetIds).size, res.report.usedAssetIds.length, 'no repeats');

// the whole thing is one undo step and renders onto real tracks
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
const h1 = historyReduce({ past: [], present: doc, future: [] }, res.action!);
assert.equal(h1.past.length, 1);
assert.ok(h1.present.timelines[0]!.items.length >= tiles.length);
assert.equal(historyReduce(h1, { type: 'undo' }).present.timelines[0]!.items.length, 0);

// short on footage: fewer layouts, no repeats
const few = assemble({ ...base, clips: clips(8) });
assert.ok(few.action);
assert.equal(new Set(few.report.usedAssetIds).size, few.report.usedAssetIds.length);
assert.ok(few.report.warnings.some((w) => /short/.test(w)));
assert.equal(assemble({ ...base, clips: clips(2) }).action, null);
console.log('collageGrid.verify: ok');
