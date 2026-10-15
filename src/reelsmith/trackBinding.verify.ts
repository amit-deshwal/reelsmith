import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, timelineTrackIds, trackAlias, trackKind } from '../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './assembler';
import { bindTracks } from './trackBinding';

const load = (f: string) => { const r = parseRecipe(readFileSync(`recipes/${f}.recipe.json`, 'utf8')); assert.ok(r.ok); return r.recipe; };
const music: AssemblyMusic = { assetId: 's', name: 's', src: '/s', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const clips: AssemblyClip[] = Array.from({ length: 40 }, (_, i) => ({ assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 7) % 13) / 13 }));

let n = 0;
const ids = () => `track_t${++n}`;
const apply = (h: History, recipeFile: string, params: Record<string, string | number | boolean>, texts: Record<string, string> = {}) => {
  const res = assemble({ recipe: load(recipeFile), clips, music, texts, params, seed: 1 });
  assert.ok(res.action, recipeFile);
  const tl = activeTimeline(h.present);
  const bound = bindTracks({ ...res.action!, actions: [{ type: 'clear' }, ...res.action!.actions] }, tl as never, ids);
  return historyReduce(h, bound);
};
const fresh = (): History => ({ past: [], present: emptyProjectDoc(), future: [] });

// beat-cut: clips on the existing main lane, flashes on ONE new lane above it, song on a new audio lane. No ghost lanes.
let h = apply(fresh(), 'beat-cut', { dropAtS: 0, flashOnBars: true, beforeDrop: 'everyBar' });
let tl = activeTimeline(h.present);
const lanes = timelineTrackIds(tl);
assert.ok(tl.items.every((i) => lanes.includes(i.track)), 'every item sits on a real lane');
assert.equal(new Set(tl.items.map((i) => i.track)).size, lanes.filter((l) => tl.items.some((i) => i.track === l)).length);
assert.equal(lanes.filter((l) => trackKind(tl, l) === 'video').length, 2, 'main lane + one overlay lane');
assert.equal(lanes.filter((l) => trackKind(tl, l) === 'audio').length, 1);
const clipLane = tl.items.find((i) => i.kind === 'video')!.track;
assert.equal(trackAlias(tl, clipLane), 'V1', 'clips are on V1');
const flashLane = tl.items.find((i) => i.kind === 'solid')!.track;
assert.equal(trackAlias(tl, flashLane), 'V2', 'flashes are above');
assert.equal(h.past.length, 1, 'still one undo step');
assert.equal(activeTimeline(historyReduce(h, { type: 'undo' }).present).items.length, 0);

// assembling again reuses the lanes instead of piling up new ones
const before = timelineTrackIds(tl).length;
h = apply(h, 'beat-cut', { dropAtS: 0, flashOnBars: true, beforeDrop: 'everyBar' });
assert.equal(timelineTrackIds(activeTimeline(h.present)).length, before, 'no new lanes on re-assemble');

// collage: tile lanes above V1, title lane on top
h = apply(fresh(), 'collage-grid', { gutter: 12, radius: 18, bg: '#F4F1EA' }, { title: 'Pune' });
tl = activeTimeline(h.present);
assert.ok(tl.items.every((i) => timelineTrackIds(tl).includes(i.track)));
const titleLane = tl.items.find((i) => i.kind === 'text')!.track;
assert.equal(timelineTrackIds(tl)[0], titleLane, 'title lane is the topmost');
assert.equal(trackAlias(tl, tl.items.find((i) => i.kind === 'solid')!.track), 'V1', 'background on V1');
console.log('trackBinding.verify: ok');
