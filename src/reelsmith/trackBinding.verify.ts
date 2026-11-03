import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, timelineTrackIds, trackAlias, trackKind } from '../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from './assembler';
import { samplePlan, sampleRecipe } from './runFixtures';
import { bindTracks } from './trackBinding';
import { revisionOf } from '../agent/external-edit-session';
import { runProjectMigrations } from '../persist/migrations';

const plan = samplePlan();
const recipe = sampleRecipe(plan);
const music: AssemblyMusic = { assetId: 's', name: 's', src: '/s', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const clips: AssemblyClip[] = Array.from({ length: 40 }, (_, i) => ({ assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 7) % 13) / 13 }));

let n = 0;
const ids = () => `track_t${++n}`;
const apply = (h: History) => {
  const res = assemble({ recipe, clips, music, texts: {}, params: {}, seed: 1, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  const tl = activeTimeline(h.present);
  const bound = bindTracks({ ...res.action!, actions: [{ type: 'clear' }, ...res.action!.actions] }, tl as never, ids);
  return historyReduce(h, bound);
};
const fresh = (): History => ({ past: [], present: emptyProjectDoc(), future: [] });

// a directed reel: the black canvas on the main lane, clips above it, the song on a new audio lane, no ghost lanes
let h = apply(fresh());
let tl = activeTimeline(h.present);
const lanes = timelineTrackIds(tl);
assert.ok(tl.items.every((i) => lanes.includes(i.track)), 'every item sits on a real lane');
assert.equal(new Set(tl.items.map((i) => i.track)).size, lanes.filter((l) => tl.items.some((i) => i.track === l)).length, 'no empty lanes');
assert.equal(lanes.filter((l) => trackKind(tl, l) === 'audio').length, 1);
assert.equal(trackAlias(tl, tl.items.find((i) => i.kind === 'solid')!.track), 'V1', 'the black canvas is on V1');
assert.equal(trackAlias(tl, tl.items.find((i) => i.kind === 'video')!.track), 'V2', 'clips are above it');
assert.equal(h.past.length, 1, 'still one undo step');
assert.equal(activeTimeline(historyReduce(h, { type: 'undo' }).present).items.length, 0);

// assembling again reuses the lanes instead of piling up new ones
const before = timelineTrackIds(tl).length;
h = apply(h);
assert.equal(timelineTrackIds(activeTimeline(h.present)).length, before, 'no new lanes on re-assemble');

// each clip carries its asset's sourceRevision, so the document the server saves (after migrations) has the same
// revision as the live one; otherwise every agent call after Assemble was refused as stale until a reload
{
  let p = fresh();
  p = historyReduce(p, { type: 'batch', label: 'pool', actions: [
    ...clips.map((c) => ({ type: 'addAsset' as const, asset: { id: c.assetId, name: c.name, kind: 'video' as const, src: c.src, durationInFrames: 300, width: 1080, height: 1920 } })),
    { type: 'addAsset' as const, asset: { id: 's', name: 's', kind: 'audio' as const, src: '/s', durationInFrames: 1800 } },
  ] } as never);
  const res = assemble({ recipe, clips, music, texts: {}, params: {}, seed: 1, plan });
  const live = historyReduce(p, bindTracks(res.action!, { ...activeTimeline(p.present), assets: p.present.assets }, ids)).present;
  assert.ok(activeTimeline(live).items.filter((i) => i.src).every((i) => i.sourceRevision), 'clips carry sourceRevision');
  const saved = runProjectMigrations(JSON.parse(JSON.stringify(live)))!.doc;
  assert.equal(revisionOf(saved), revisionOf(live), 'saved revision matches the live one');
}
console.log('trackBinding.verify: ok');
