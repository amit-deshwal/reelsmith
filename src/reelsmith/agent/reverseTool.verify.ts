// RS-1223 in the agent: reels_reverse (a whole clip, a stretch of one, forwards again) and the director's rewind move
// (plays, rewinds the same span on the beat, plays again), whose backwards part the build swaps for a reversed copy.
import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import type { AtomicAction } from '../../editor/reducerActions';
import { activeTimeline, type TimelineItem } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { isReversed } from '../clipOps';
import { directorRecipe } from '../director/assembleDirector';
import { REWIND_FX } from '../director/creatorMoves';
import { parseReverseArgs, reverseTool } from './reverseTool';
import { rewindClips } from './rewindClips';

const fps = 30;
const calls: Array<{ src: string; startSec: number; frames: number; fps: number }> = [];
const api = {
  reverseClip: async (src: string, startSec: number, frames: number, rate: number) => {
    calls.push({ src, startSec, frames, fps: rate });
    return src.includes('broken') ? { error: 'no video stream' } : { src: `/media/uploads/rev-${calls.length}.mp4`, width: 1080, height: 1920, frames };
  },
};
let n = 0;
const newId = () => `new-${++n}`;

// args
assert.ok('error' in parseReverseArgs({}), 'a clip must be named');
assert.ok('error' in parseReverseArgs({ atSec: -1 }));
assert.ok('error' in parseReverseArgs({ atSec: 1, fromSec: 3, toSec: 2 }));
assert.deepEqual(parseReverseArgs({ fromSec: 2, toSec: 3 }), { forwards: false, atSec: 2, fromSec: 2, toSec: 3 });

let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const clip = { id: 'c', track: 'V1', kind: 'video' as const, name: 'jump', src: '/media/uploads/jump.mp4', sourceAssetId: 'a', durationInFrames: 120, srcInFrame: 30, playbackRate: 1, volume: 1, width: 1080, height: 1920 };
h = historyReduce(h, { type: 'add', startFrame: 60, item: clip } as never);
h = historyReduce(h, { type: 'add', startFrame: 180, item: { ...clip, id: 'after', name: 'after' } } as never);
const state = () => activeTimeline(h.present);
const item = (id: string) => state().items.find((i) => i.id === id)!;
const run = (plan: { actions: AtomicAction[]; label: string }) => { h = historyReduce(h, { type: 'batch', label: plan.label, actions: plan.actions }); };

// a stretch (3-4 s on the timeline) is split off and reversed; the rest and the clip after stay put; one undo step
{
  const steps = h.past.length;
  const out = await reverseTool({ atSec: 3, fromSec: 3, toSec: 4 }, state(), api, newId);
  assert.ok(!('error' in out), JSON.stringify(out));
  run(out as never);
  assert.equal(h.past.length, steps + 1);
  // the stretch starts 30 frames into the clip, so 60 frames into the source: 2 s, 30 frames
  assert.deepEqual(calls.at(-1), { src: '/media/uploads/jump.mp4', startSec: 2, frames: 30, fps: 30 });
  const mid = item((out as { itemId: string }).itemId);
  assert.deepEqual([mid.startFrame, mid.durationInFrames, mid.srcInFrame ?? 0, mid.src], [90, 30, 0, '/media/uploads/rev-1.mp4']);
  assert.ok(isReversed(mid));
  const parts = state().items.filter((i) => i.name === 'jump').sort((x, y) => x.startFrame - y.startFrame);
  assert.deepEqual(parts.map((p) => [p.startFrame, p.durationInFrames]), [[60, 30], [90, 30], [120, 60]], 'before, reversed, after');
  assert.equal(parts[2]!.srcInFrame, 90, 'the rest of the clip plays on from where it was');
  assert.equal(item('after').startFrame, 180);

  // reversing it again is refused; forwards puts the stretch back
  assert.match((await reverseTool({ itemId: mid.id }, state(), api, newId) as { error: string }).error, /already reversed/);
  const back = await reverseTool({ itemId: mid.id, forwards: true }, state(), api, newId);
  run(back as never);
  assert.deepEqual([item(mid.id).src, item(mid.id).srcInFrame], ['/media/uploads/jump.mp4', 60]);
  assert.match((await reverseTool({ itemId: mid.id, forwards: true }, state(), api, newId) as { error: string }).error, /not reversed/);
}

// the whole clip, named by id; no split
{
  const before = state().items.length;
  const out = await reverseTool({ itemId: 'after' }, state(), api, newId) as { actions: AtomicAction[]; itemId: string; label: string };
  assert.equal(out.itemId, 'after');
  assert.ok(!out.actions.some((a) => a.type === 'split'));
  run(out);
  assert.equal(state().items.length, before);
  assert.deepEqual(calls.at(-1), { src: '/media/uploads/jump.mp4', startSec: 1, frames: 120, fps: 30 });
}

// refusals: a photo, nothing at that second, a failed reverse (the timeline is unchanged)
assert.ok('error' in await reverseTool({ atSec: 0.5 }, state(), api, newId), 'no clip at 0.5 s');
h = historyReduce(h, { type: 'add', startFrame: 400, item: { ...clip, id: 'broken', src: '/media/uploads/broken.mp4' } } as never);
assert.match((await reverseTool({ itemId: 'broken' }, state(), api, newId) as { error: string }).error, /no video stream/);
assert.equal(item('broken').src, '/media/uploads/broken.mp4');

// the director's rewind move: plays, rewinds the same span fast with a VHS look and a scratch, plays again
{
  const footage: AssemblyClip[] = [{ assetId: 'splash', name: 'splash', src: '/media/uploads/splash.mp4', kind: 'video', width: 1080, height: 1920, durationInFrames: 300, score: 0.5 }];
  const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
  const parsed = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'rewind', beats: 8, clips: ['splash'] }] });
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const plan = (parsed as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips: footage, music, texts: {}, params: {}, seed: 1, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  const adds = res.action!.actions.filter((a): a is Extract<AtomicAction, { type: 'add' }> => a.type === 'add');
  const shots = adds.filter((a) => a.item.src === '/media/uploads/splash.mp4').sort((x, y) => (x.startFrame ?? 0) - (y.startFrame ?? 0));
  assert.equal(shots.length, 3, 'play, rewind, play again');
  const [play, back, again] = shots.map((s) => ({ at: s.startFrame ?? 0, item: s.item as TimelineItem }));
  assert.equal(play!.at + play!.item.durationInFrames, back!.at, 'the rewind starts where the play ends');
  assert.equal(back!.at, 4 * 15, 'on a beat (beat 4 of 8 at 120 bpm)');
  assert.equal(back!.at + back!.item.durationInFrames, again!.at);
  assert.equal(again!.at + again!.item.durationInFrames, 8 * 15, 'fills the section');
  // the rewind covers exactly the span that played, faster
  assert.equal(back!.item.srcInFrame, play!.item.srcInFrame);
  assert.ok(Math.abs(back!.item.durationInFrames * (back!.item.playbackRate ?? 1) - play!.item.durationInFrames) < 0.5);
  assert.ok((back!.item.playbackRate ?? 1) > 1.5);
  assert.equal(again!.item.srcInFrame, play!.item.srcInFrame, 'the moment plays again');
  assert.equal((back!.item.props as { rsRewind?: boolean }).rsRewind, true);
  assert.equal(back!.item.effects?.[0]?.assetId, REWIND_FX);
  assert.equal(back!.item.volume, 0);
  assert.ok(adds.some((a) => a.startFrame === back!.at && (a.item.props as { rsAccent?: string }).rsAccent === 'scratch'), 'a scratch on the rewind');

  // the build swaps the backwards part for a reversed copy of that span, and only that part
  const before = calls.length;
  const messages = await rewindClips(res.action!.actions, api, fps);
  assert.deepEqual(messages, []);
  assert.equal(calls.length, before + 1);
  assert.deepEqual(calls.at(-1), { src: '/media/uploads/splash.mp4', startSec: (play!.item.srcInFrame ?? 0) / fps, frames: play!.item.durationInFrames, fps });
  const swapped = adds.find((a) => (a.item.props as { rsRewind?: boolean }).rsRewind)!.item as TimelineItem;
  assert.match(swapped.src!, /rev-/);
  assert.equal(swapped.srcInFrame, 0);
  assert.equal(swapped.sourceAssetId, undefined);
  assert.equal((swapped.props as { rsReversed?: { assetId?: string } }).rsReversed?.assetId, 'splash', 'remembers its clip');
  assert.equal(swapped.playbackRate, back!.item.playbackRate);
  assert.equal(adds.filter((a) => a.item.src === '/media/uploads/splash.mp4').length, 2, 'the forwards parts are untouched');

  // without the server it plays forwards and says so
  const again2 = assemble({ recipe: directorRecipe(plan), clips: footage, music, texts: {}, params: {}, seed: 1, plan });
  assert.match((await rewindClips(again2.action!.actions, {}, fps))[0]!, /plays forwards/);
}
console.log('reverseTool.verify: ok');
