import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline, type MediaAsset } from '../editor/types';
import { findMusicItem, planSnapCuts, readBeatGrid, timelineBeatFrames, type BeatGridProp } from './beatSnap';
import { bindTracks } from './trackBinding';

const fps = 30;
// 120 bpm: a beat every 15 frames, bars every 60
const grid: BeatGridProp = { beatTimesSec: Array.from({ length: 80 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 1 };

// mapping through trim and speed
const music = { startFrame: 0, durationInFrames: 600, srcInFrame: 0, playbackRate: 1 };
const beats = timelineBeatFrames(music, grid, fps, 1);
assert.equal(beats[0], 8, 'first beat 0.25 s -> frame 8 (rounded)');
assert.equal(beats[2]! - beats[1]!, 15);
const bars = timelineBeatFrames(music, grid, fps, 4);
assert.equal(bars[0], Math.round(0.75 * fps), 'every 4 counts from the first downbeat');
assert.equal(bars[1]! - bars[0]!, 60);
const trimmed = timelineBeatFrames({ ...music, startFrame: 30, srcInFrame: 15 }, grid, fps, 1);
assert.equal(trimmed[0], 38, 'trim shifts the grid; beats before the in-point are dropped');
const fast = timelineBeatFrames({ ...music, playbackRate: 2 }, grid, fps, 1);
assert.ok(Math.abs(fast[2]! - fast[1]! - 7.5) <= 1, 'speed 2x halves the beat spacing');

// a timeline with 4 touching clips whose cuts are a few frames off the beat
const assets: MediaAsset[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, kind: 'video', src: `/${id}`, durationInFrames: 900 } as MediaAsset));
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const starts = [0, 52, 125, 170];
const ends = [52, 125, 170, 241];
const add = {
  type: 'batch' as const, label: 'setup',
  actions: [
    ...assets.map((a) => ({ type: 'addAsset' as const, asset: a })),
    ...assets.map((a, i) => ({
      type: 'add' as const, startFrame: starts[i],
      item: { id: `v${a.id}`, track: 'V1', kind: 'video' as const, name: a.id, src: a.src, sourceAssetId: a.id, durationInFrames: ends[i]! - starts[i]!, srcInFrame: 100 },
    })),
    { type: 'add' as const, startFrame: 0, item: { id: 'm', track: 'A1', kind: 'audio' as const, name: 'song', src: '/s', durationInFrames: 600, props: { rsBeats: grid } } },
  ],
};
h = historyReduce(h, bindTracks(add, activeTimeline(h.present)));
let tl = activeTimeline(h.present);
const v1 = tl.items.find((i) => i.id === 'va')!.track;
const m = findMusicItem(tl)!;
assert.equal(m.id, 'm');
assert.ok(readBeatGrid(m));

const plan = planSnapCuts(tl, v1, timelineBeatFrames(m, readBeatGrid(m)!, fps, 1), { assets });
assert.ok(plan.moved >= 3, `moved ${plan.moved}`);
h = historyReduce(h, { type: 'batch', label: 'Snap cuts to beats', actions: plan.actions });
tl = activeTimeline(h.present);
const clips = tl.items.filter((i) => i.track === v1).sort((a, b) => a.startFrame - b.startFrame);
assert.equal(clips.length, 4);
assert.equal(clips[0]!.startFrame, 0, 'first start stays');
for (let i = 0; i < clips.length; i++) {
  const end = clips[i]!.startFrame + clips[i]!.durationInFrames;
  assert.ok(beats.includes(end), `cut ${i} at ${end} is on a beat`);
  if (i + 1 < clips.length) assert.equal(clips[i + 1]!.startFrame, end, 'clips still touch');
}
// the second clip's head moved from 52 to 53: its source in-point moved with it
const b = clips[1]!;
assert.equal(b.srcInFrame, 100 + (b.startFrame - 52), 'source in-point follows the moved cut');
assert.equal(h.past.length, 2, 'the snap is one undo step');

// snapping to bars (every 4) with a short clip that cannot reach: nothing overlaps, reasons are reported
h = historyReduce(h, { type: 'undo' });
tl = activeTimeline(h.present);
const barPlan = planSnapCuts(tl, v1, timelineBeatFrames(m, grid, fps, 4), { assets, maxShiftFrames: 30 });
h = historyReduce(h, { type: 'batch', label: 'bars', actions: barPlan.actions });
tl = activeTimeline(h.present);
const after = tl.items.filter((i) => i.track === v1).sort((a, b) => a.startFrame - b.startFrame);
for (let i = 1; i < after.length; i++) assert.ok(after[i]!.startFrame >= after[i - 1]!.startFrame + after[i - 1]!.durationInFrames, 'no overlaps');
assert.ok(after.every((c) => c.durationInFrames >= 9), 'min length kept');

// a clip at the end of its source is never stretched
const shortAssets = assets.map((a) => ({ ...a, durationInFrames: 152 }));
const tight = planSnapCuts(activeTimeline(historyReduce(h, { type: 'undo' }).present), v1, [60], { assets: shortAssets, maxShiftFrames: 30 });
assert.ok(tight.skipped.some((s) => s.itemId === 'va'), 'clip a (52 frames, 52 left in source) cannot grow to 60');

console.log('beatSnap.verify ok');

// dragging: the stored beats are snap targets
{
  const { collectTimelineSnapPoints } = await import('../editor/snap');
  const pts = collectTimelineSnapPoints(activeTimeline(h.present), {});
  const beatPts = pts.filter((p) => p.type === 'beat');
  assert.ok(beatPts.length > 30, 'beat snap points present');
  assert.ok(beatPts.some((p) => p.frame === beats[3]));
  console.log('beat drag snap ok');
}
