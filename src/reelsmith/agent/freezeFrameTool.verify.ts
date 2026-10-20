import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline, type TimelineItem } from '../../editor/types';
import { bindTracks } from '../trackBinding';
import { freezeFrameTool, freezeTarget, parseFreezeArgs, planFreeze } from './freezeFrameTool';

// a 6 s clip from 2 s of its source, framed and graded, with a push in; a second clip after it; a cut-out copy over it
const clip = {
  id: 'clip', track: 'V2', kind: 'video', name: 'IMG_1.MOV', src: '/media/uploads/a.mov', sourceAssetId: 'a', durationInFrames: 180, srcInFrame: 60, volume: 1,
  width: 1080, height: 1920, transform: { scale: 1.2, scaleX: 1.2, scaleY: 1.2, x: 4, y: 0 }, effects: [{ id: 'look_1', assetId: 'builtin:fx-halation', overrides: {} }],
  keyframes: { scale: [{ frame: 0, value: 1 }, { frame: 90, value: 1.1 }, { frame: 179, value: 1.2 }] }, props: { rsSection: '2-cut' },
};
const fresh = (): History => {
  let h: History = { past: [], present: emptyProjectDoc(), future: [] };
  h = historyReduce(h, { type: 'addAsset', asset: { id: 'a', kind: 'video', name: 'IMG_1.MOV', src: clip.src, durationInFrames: 600, width: 1080, height: 1920 } } as never);
  return historyReduce(h, bindTracks({ type: 'batch', label: 'reel', actions: [
    { type: 'add', startFrame: 30, item: clip },
    { type: 'add', startFrame: 210, item: { ...clip, id: 'next', srcInFrame: 300, durationInFrames: 60, keyframes: undefined } },
    { type: 'add', startFrame: 30, item: { ...clip, id: 'cutout', track: 'V3', effects: [{ id: 'c', assetId: 'builtin:fx-person-cutout', overrides: {} }] } },
  ] } as never, activeTimeline(h.present)));
};
const still = { src: '/media/uploads/a.still-4000.jpg', width: 1080, height: 1920 };
let n = 0;
const ids = () => `id${++n}`;
const apply = (h: History, actions: unknown[]) => activeTimeline(historyReduce(h, { type: 'batch', label: 'freeze', actions } as never).present);
const byStart = (items: TimelineItem[], track: string) => items.filter((i) => i.track === track).sort((a, b) => a.startFrame - b.startFrame);

const args = (raw: Record<string, unknown>) => { const p = parseFreezeArgs(raw); assert.ok(!('error' in p), JSON.stringify(p)); return p as Exclude<typeof p, { error: string }>; };
assert.deepEqual(parseFreezeArgs({}), { error: 'atSec (timeline seconds of the moment to freeze) is required' });
assert.ok('error' in parseFreezeArgs({ atSec: 2, holdSec: 30 }));

// freeze 1 s at reel 2 s (1 s into the clip, which starts at 1 s from source 2 s: source 3 s), then play on from there
{
  const h = fresh();
  const tl = activeTimeline(h.present);
  const target = freezeTarget(tl, args({ atSec: 2, holdSec: 1 }));
  assert.ok(!('error' in target) && target.id === 'clip', 'the cut-out copy over the clip is not the clip to freeze');
  const plan = planFreeze(tl, target as TimelineItem, args({ atSec: 2, holdSec: 1 }), still, ids);
  assert.equal(plan.sourceSec, 3);
  const items = apply(h, plan.actions).items;
  const track = (items.find((i) => i.id === 'clip')!).track;
  const [left, frozen, rest, next] = byStart(items, track);
  assert.deepEqual([left!.startFrame, left!.durationInFrames, left!.srcInFrame], [30, 30, 60], 'the clip plays up to the moment');
  assert.equal(frozen!.kind, 'image');
  assert.deepEqual([frozen!.startFrame, frozen!.durationInFrames, frozen!.src], [60, 30, still.src], 'the still holds 1 s');
  assert.deepEqual(frozen!.transform, clip.transform, 'same framing');
  assert.deepEqual(frozen!.effects, clip.effects, 'same look');
  assert.equal(frozen!.srcInFrame, undefined);
  assert.equal(frozen!.volume, undefined);
  assert.deepEqual([rest!.startFrame, rest!.durationInFrames, rest!.srcInFrame], [90, 120, 90], 'the rest plays on from the frozen moment (source 3 s)');
  assert.equal(next!.startFrame, 210, 'the next cut stays where it was');
}
// resume "skip": the rest continues as if the clip had kept playing under the still
{
  const h = fresh();
  const tl = activeTimeline(h.present);
  const plan = planFreeze(tl, tl.items.find((i) => i.id === 'clip')!, args({ atSec: 2, holdSec: 1, resume: 'skip' }), still, ids);
  const rest = apply(h, plan.actions).items.find((i) => i.kind === 'video' && i.startFrame === 90)!;
  assert.equal(rest.srcInFrame, 120);
}
// a keyframe inside the hold moves with it (the push at clip frame 90 lands 15 frames into a still from clip frame 75)
{
  const tl = activeTimeline(fresh().present);
  const plan = planFreeze(tl, tl.items.find((i) => i.id === 'clip')!, args({ atSec: 3.5, holdSec: 1 }), still, ids);
  const frozen = (plan.actions.find((x) => x.type === 'add') as any).item;
  assert.deepEqual(frozen.keyframes.scale.map((k: { frame: number }) => k.frame), [15]);
}
// at the clip's first frame, held past its end: no left piece, the hold stops at the clip's end
{
  const h = fresh();
  const tl = activeTimeline(h.present);
  const plan = planFreeze(tl, tl.items.find((i) => i.id === 'clip')!, args({ atSec: 6.5, holdSec: 5 }), still, ids);
  assert.equal(plan.holdFrames, 15, 'clamped to the 0.5 s left in the clip');
  const items = apply(h, plan.actions).items;
  assert.ok(items.some((i) => i.kind === 'image' && i.startFrame === 195 && i.durationInFrames === 15));
  assert.ok(!items.some((i) => i.id === 'clip' && i.durationInFrames === 180), 'the clip is shortened, not left under the still');
}
// two clips at the moment need an itemId; a moment with no video says so
{
  const tl = activeTimeline(fresh().present);
  const two = { ...tl, items: [...tl.items, { ...clip, id: 'side', track: 'V4', startFrame: 30 } as TimelineItem] };
  const e = freezeTarget(two, args({ atSec: 3 }));
  assert.ok('error' in e && /pass itemId/.test(e.error));
  assert.ok(!('error' in freezeTarget(two, args({ atSec: 3, itemId: 'side' }))));
  assert.ok('error' in freezeTarget(tl, args({ atSec: 0.5 })), 'nothing plays at 0.5 s');
}
// the tool asks the server for the exact source second
{
  const tl = activeTimeline(fresh().present);
  const asked: number[] = [];
  const out = await freezeFrameTool({ atSec: 2, holdSec: 1 }, tl, { stillFrame: async (_a, at) => { asked.push(at); return still; } }, ids);
  assert.ok(!('error' in out) && !out.clamped);
  assert.deepEqual(asked, [3]);
}
console.log('freezeFrameTool: ok');
