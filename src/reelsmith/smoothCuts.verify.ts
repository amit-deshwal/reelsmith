// RS-1259 follow-up: smooth cuts. After reels_clean_speech cuts a talking clip into pieces, each jump between two
// pieces gets a short muted overlay that morphs across it, on a track straight above the clip, with the piece's look;
// the pieces themselves (sound, captions) are untouched, and one undo removes the cleanup and the overlays together.
import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { reduce } from '../editor/reducerTimeline';
import { timelineTrackIds } from '../editor/timelineTypes';
import { activeTimeline, type TimelineItem, type TimelineState } from '../editor/types';
import type { TranscriptWord } from '../transcript/types';
import { planCleanSpeech } from './agent/cleanSpeechTool';
import { cutHalf, findJumpCuts, SMOOTH_CUT_TRACK, smoothCutActions } from './smoothCuts';
import type { AnalyzeApi } from './runRecipe';

const speech = (s: string): TranscriptWord[] => s.split(' ').map((text, i) => ({ text, start: 300 + i * 400, end: 300 + i * 400 + 300 }));
const look = { transform: { scale: 1.2 }, effects: [{ id: 'g', assetId: 'builtin:fx-vignette' }], props: { rsSection: 'talk' } };
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'batch', label: 'setup', actions: [
  { type: 'add', startFrame: 0, item: { id: 'a', track: 'V1', kind: 'video', name: 'talk', src: '/media/uploads/talk.mp4', sourceAssetId: 'asset-a', durationInFrames: 180, srcInFrame: 0, volume: 1, width: 1080, height: 1920, transcript: speech('um I went I went to the market. uh it was it was busy.'), ...look } },
  { type: 'add', startFrame: 0, item: { id: 't', track: 'V2', kind: 'text', name: 'title', durationInFrames: 60, props: { text: 'Hi' } } },
] } as never);
const before = activeTimeline(h.present);
assert.equal(cutHalf(30), 2);
assert.equal(cutHalf(60), 4);
assert.equal(cutHalf(24), 2);

// the cleanup's pieces: jumps between them, found on the timeline as it will be
let n = 0;
const plan = planCleanSpeech(before, { level: 'tight', pauses: true, smoothCuts: true }, () => `p${++n}`);
assert.ok(!('error' in plan));
const after = plan.actions.reduce((s, a) => reduce(s, a), before);
const pieces = after.items.filter((i) => i.src === '/media/uploads/talk.mp4').sort((x, y) => x.startFrame - y.startFrame);
assert.ok(pieces.length >= 2, `${pieces.length} pieces`);
const cuts = findJumpCuts(after);
assert.equal(cuts.length, pieces.length - 1, 'one jump between each two pieces');
for (const [k, c] of cuts.entries()) {
  assert.equal(c.a.id, pieces[k]!.id);
  assert.equal(c.cutFrame, pieces[k + 1]!.startFrame);
  // the frames just outside the overlay: the last one shown before it, the first one after
  assert.equal(c.fromSec, ((pieces[k]!.srcInFrame ?? 0) + pieces[k]!.durationInFrames - 1 - 2) / 30);
  assert.equal(c.toSec, ((pieces[k + 1]!.srcInFrame ?? 0) + 2) / 30);
  assert.ok(c.toSec > c.fromSec);
}

// what is not a jump cut
const two = (b: Partial<TimelineItem>, a: Partial<TimelineItem> = {}, extra: Partial<TimelineState> = {}) => findJumpCuts({
  fps: 30, items: [
    { id: 'x', track: 'V1', kind: 'video', name: 'x', src: 's.mp4', startFrame: 0, durationInFrames: 30, srcInFrame: 0, ...a } as TimelineItem,
    { id: 'y', track: 'V1', kind: 'video', name: 'y', src: 's.mp4', startFrame: 30, durationInFrames: 30, srcInFrame: 45, ...b } as TimelineItem,
  ], ...extra,
}).length;
assert.equal(two({}), 1, 'a later moment of the same file, straight after');
assert.equal(two({ srcInFrame: 30 }), 0, 'continuous: no jump');
assert.equal(two({ srcInFrame: 0 }), 0, 'backwards');
assert.equal(two({ srcInFrame: 30 + 30 * 3 + 1 }), 0, 'more than 3 s apart');
assert.equal(two({ src: 'other.mp4' }), 0, 'another file');
assert.equal(two({ startFrame: 31 }), 0, 'a gap between them');
assert.equal(two({ track: 'V2' }), 0, 'another track');
assert.equal(two({ playbackRate: 2 }), 0, 'sped up');
assert.equal(two({ transform: { scale: 1.2 } }), 0, 'a jump zoom is meant');
assert.equal(two({}, { keyframes: { scale: [] } as never }), 0, 'keyframed');
assert.equal(two({ durationInFrames: 2 }), 0, 'too short to give up two frames');
assert.equal(two({}, {}, { transitions: [{ id: 'tr', type: 'fade', durationInFrames: 10, outgoingItemId: 'x', incomingItemId: 'y', trackId: 'V1' }] as never }), 0, 'a transition already joins them');

// the overlays: one per cut, from the server, on a new track just above the talking clip (under the title)
const calls: unknown[][] = [];
const api: Pick<AnalyzeApi, 'smoothCut'> = {
  smoothCut: async (...args) => { calls.push(args); return { src: `/media/uploads/talk.cut-${calls.length}.mp4`, width: 1080, height: 1920, frames: 4 }; },
};
const progress: string[] = [];
const made = await smoothCutActions(after, api, () => `o${++n}`, new Set(pieces.map((p) => p.id)), (m) => progress.push(m));
assert.equal(made.made, cuts.length);
assert.deepEqual(made.notes, []);
assert.deepEqual(progress, [`Smoothing ${cuts.length} jump cut${cuts.length === 1 ? "" : "s"}`]);
assert.deepEqual(calls.map((c) => c.slice(1)), cuts.map((c) => [c.fromSec, c.toSec, 4, 30]));
assert.ok(calls.every((c) => c[0] === '/media/uploads/talk.mp4'));
h = historyReduce(h, { type: 'batch', label: 'Clean up speech', actions: [...plan.actions, ...made.actions] });
const tl = activeTimeline(h.present);
const order = timelineTrackIds(tl);
assert.ok(order.indexOf('V2') < order.indexOf(SMOOTH_CUT_TRACK) && order.indexOf(SMOOTH_CUT_TRACK) < order.indexOf('V1'), `the overlay track sits between the title and the clip: ${order.join(' ')}`);
const overlays = tl.items.filter((i) => i.track === SMOOTH_CUT_TRACK).sort((x, y) => x.startFrame - y.startFrame);
assert.equal(overlays.length, cuts.length);
for (const [k, o] of overlays.entries()) {
  assert.equal(o.startFrame, cuts[k]!.cutFrame - 2);
  assert.equal(o.durationInFrames, 4);
  assert.equal(o.srcInFrame, 0);
  assert.equal(o.volume, 0, 'muted: the pieces under it carry the sound');
  assert.equal(o.transcript, undefined, 'no captions of its own');
  assert.equal(o.sourceAssetId, undefined, 'not pool media');
  assert.deepEqual(o.transform, look.transform, "the piece's framing");
  assert.deepEqual(o.effects, look.effects, "the piece's look");
  assert.equal((o.props as { rsSection?: string }).rsSection, 'talk');
  assert.deepEqual((o.props as { rsSmoothCut?: unknown }).rsSmoothCut, { from: cuts[k]!.a.id, to: cuts[k]!.b.id, fromSec: cuts[k]!.fromSec, toSec: cuts[k]!.toSec });
}
// the pieces are as the cleanup left them
assert.deepEqual(tl.items.filter((i) => i.track === 'V1').map((i) => [i.id, i.startFrame, i.durationInFrames, i.srcInFrame]), after.items.filter((i) => i.track === 'V1').map((i) => [i.id, i.startFrame, i.durationInFrames, i.srcInFrame]));
// one undo takes it all back
h = historyReduce(h, { type: 'undo' } as never);
assert.deepEqual(activeTimeline(h.present).items.map((i) => i.id).sort(), ['a', 't']);

// asked again on a timeline that has them: nothing new
{
  h = historyReduce(h, { type: 'redo' } as never);
  const again = await smoothCutActions(activeTimeline(h.present), api, () => 'z', undefined);
  assert.deepEqual(again, { actions: [], made: 0, notes: [] });
}
// not possible here: said once, nothing added
{
  let asked = 0;
  const out = await smoothCutActions(after, { smoothCut: async () => { asked += 1; return { skipped: 'smooth cuts need macOS 15.4 or later', unavailable: true }; } }, () => 'z');
  assert.ok(asked <= 3);
  assert.deepEqual(out, { actions: [], made: 0, notes: ['jump cuts stay hard cuts: smooth cuts need macOS 15.4 or later'] });
}
// one fails: the others still go in, the failure is named
{
  let k = 0;
  const out = await smoothCutActions(after, { smoothCut: async (src) => { k += 1; if (k === 1) throw new Error('decode failed'); return { src: src.replace('.mp4', `.c${k}.mp4`), width: 1080, height: 1920, frames: 4 }; } }, () => `q${k}`);
  assert.equal(out.made, cuts.length - 1);
  assert.equal(out.notes.length, 1);
  assert.match(out.notes[0]!, /stays a jump: decode failed/);
}
// no route (an older server): nothing
assert.deepEqual(await smoothCutActions(after, {}, () => 'z'), { actions: [], made: 0, notes: [] });

console.log(`smoothCuts.verify: ok (cuts found: ${cuts.length})`);
