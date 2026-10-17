import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe } from '../../shared/reelsmith/recipe';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, timelineTrackIds, trackAlias, trackKind } from '../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './assembler';
import { bindTracks } from './trackBinding';
import { revisionOf } from '../agent/external-edit-session';
import { runProjectMigrations } from '../persist/migrations';

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
// each clip carries its asset's sourceRevision, so the document the server saves (after migrations) has the same
// revision as the live one; otherwise every agent call after Assemble was refused as stale until a reload
{
  let p = fresh();
  p = historyReduce(p, { type: 'batch', label: 'pool', actions: [
    ...clips.map((c) => ({ type: 'addAsset' as const, asset: { id: c.assetId, name: c.name, kind: 'video' as const, src: c.src, durationInFrames: 300, width: 1080, height: 1920 } })),
    { type: 'addAsset' as const, asset: { id: 's', name: 's', kind: 'audio' as const, src: '/s', durationInFrames: 1800 } },
  ] } as never);
  for (const [file, params, texts] of [
    ['travel-beat-montage', { cutRule: 'every2Beats', accent: '#FFD23F', titleFont: 'Anton', transition: 'cut', clipAudio: false }, { place: 'X' }],
    ['travel-diary', { clipAudio: false }, { line: 'a b / c' }],
  ] as const) {
    const res = assemble({ recipe: load(file), clips, music, texts: { ...texts }, params: { ...params }, seed: 1 });
    const live = historyReduce(p, bindTracks(res.action!, { ...activeTimeline(p.present), assets: p.present.assets }, ids)).present;
    assert.ok(activeTimeline(live).items.filter((i) => i.src).every((i) => i.sourceRevision), `${file}: clips carry sourceRevision`);
    const saved = runProjectMigrations(JSON.parse(JSON.stringify(live)))!.doc;
    assert.equal(revisionOf(saved), revisionOf(live), `${file}: saved revision matches the live one`);
  }
}
// captioned story: the caption settings land on a real caption track (created on the first assemble, reused after),
// so the Captions panel and preview can see them. Before the fix they were stored on no track at all.
{
  const cs = (params: Record<string, string>) => assemble({ recipe: load('captioned-story'), clips: clips.slice(0, 3).map((c) => ({ ...c, kind: 'video' as const, transcript: [{ text: 'hi', start: 0, end: 500 }, { text: 'there', start: 600, end: 1100 }] as never })), music, texts: { hook: 'Hook' }, params: params as never, seed: 1 });
  const res = cs({ captionStyle: 'highlight-word' });
  const first = historyReduce(fresh(), bindTracks({ ...res.action!, actions: [{ type: 'clear' }, ...res.action!.actions] }, activeTimeline(fresh().present) as never, ids));
  const tlA = activeTimeline(first.present);
  const capLanes = timelineTrackIds(tlA).filter((l) => trackKind(tlA, l) === 'caption');
  assert.equal(capLanes.length, 1, 'one caption track is created');
  assert.ok(tlA.tracks?.[capLanes[0]!]?.captions?.enabled, 'captions are enabled on that track');
  assert.equal(tlA.tracks?.[capLanes[0]!]?.captions?.sourceMode, 'timeline');
  // assembling again reuses it
  const second = historyReduce(first, bindTracks({ ...res.action!, actions: [{ type: 'clear' }, ...res.action!.actions] }, activeTimeline(first.present) as never, ids));
  assert.equal(timelineTrackIds(activeTimeline(second.present)).filter((l) => trackKind(activeTimeline(second.present), l) === 'caption').length, 1, 'no second caption track on re-assemble');
}
console.log('trackBinding.verify: ok');
