// RS-1259: a director build's slowed clips are swapped for smooth copies; holds, normal and fast clips are left alone.
import assert from 'node:assert/strict';
import type { AtomicAction } from '../../editor/reducerActions';
import { smoothedFrom, smoothSlowClips, wantsSmoothing } from './smoothSlowClips';
import type { AnalyzeApi } from '../runRecipe';

const clip = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'add', startFrame: 30, item: {
    id, track: 'V1', kind: 'video', name: `clip ${id}`, src: `/media/uploads/${id}.mp4`, sourceAssetId: `asset-${id}`, sourceRevision: 'rev-1',
    durationInFrames: 60, srcInFrame: 45, width: 1440, height: 2560, volume: 0, ...extra,
  },
}) as unknown as AtomicAction;
const itemOf = (a: AtomicAction) => (a as Extract<AtomicAction, { type: 'add' }>).item as unknown as Record<string, unknown> & { props?: Record<string, unknown> };

// which clips are slow motion
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4', playbackRate: 0.3 }), true);
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4', playbackRate: 0.1 }), true, 'velocity slows to 0.1');
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4', playbackRate: 0.02 }), false, 'the freeze-frame intro holds at 0.02');
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4' }), false);
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4', playbackRate: 2.8 }), false);
assert.equal(wantsSmoothing({ kind: 'image', src: 'a.jpg', playbackRate: 0.3 }), false);
assert.equal(wantsSmoothing({ kind: 'video', src: 'a.mp4', playbackRate: 0.3, props: { rsSmooth: { src: 'x' } } }), false, 'smoothed once');

// a build with a slow, a fast, a normal and a held clip: only the slow one is sent, with its span in seconds
{
  const calls: unknown[][] = [];
  const api: Pick<AnalyzeApi, 'smoothSlow'> = {
    smoothSlow: async (...args) => { calls.push(args); return { src: '/media/uploads/s.slow-1500-300x60f30.mp4', width: 1440, height: 2560, frames: 60 }; },
  };
  const effects = [{ id: 'fx', assetId: 'builtin:fx-motion-blur' }];
  const keyframes = { scale: [{ frame: 0, value: 1.1 }, { frame: 10, value: 1 }] };
  const actions = [
    clip('s', { playbackRate: 0.3, effects, keyframes, props: { rsSection: '2-vel-3' } }),
    clip('f', { playbackRate: 2.8 }), clip('n'), clip('h', { playbackRate: 0.02 }),
    { type: 'setCanvas', width: 1080, height: 1920 } as unknown as AtomicAction,
  ];
  const progress: string[] = [];
  const notes = await smoothSlowClips(actions, api, 30, (m) => progress.push(m));
  assert.deepEqual(notes, []);
  assert.deepEqual(calls, [['/media/uploads/s.mp4', 1.5, 0.3, 60, 30]]);
  assert.deepEqual(progress, ['Smoothing the slow motion (1 clip)']);
  const s = itemOf(actions[0]!);
  // the copy is exactly the span, already slowed: from frame 0 at speed 1, same place and length
  assert.equal(s.src, '/media/uploads/s.slow-1500-300x60f30.mp4');
  assert.equal(s.srcInFrame, 0);
  assert.equal(s.playbackRate, undefined);
  assert.equal(s.durationInFrames, 60);
  assert.equal((actions[0] as { startFrame?: number }).startFrame, 30);
  assert.equal(s.sourceFilename, 's.slow-1500-300x60f30.mp4');
  assert.notEqual(s.sourceRevision, 'rev-1', 'a new revision, so cached frames of the slowed clip are not reused');
  assert.equal(s.sourceAssetId, undefined, 'the copy is not pool media');
  assert.deepEqual(s.effects, effects);
  assert.deepEqual(s.keyframes, keyframes);
  assert.equal(s.props?.rsSection, '2-vel-3');
  const from = smoothedFrom(s as never)!;
  assert.deepEqual({ src: from.src, srcInFrame: from.srcInFrame, playbackRate: from.playbackRate, assetId: from.assetId, sourceRevision: from.sourceRevision },
    { src: '/media/uploads/s.mp4', srcInFrame: 45, playbackRate: 0.3, assetId: 'asset-s', sourceRevision: 'rev-1' });
  // the others are untouched
  assert.equal(itemOf(actions[1]!).playbackRate, 2.8);
  assert.equal(itemOf(actions[2]!).src, '/media/uploads/n.mp4');
  assert.equal(itemOf(actions[3]!).playbackRate, 0.02);
}

// not needed (a 60 fps clip at 0.5x in a 30 fps reel): left as it is, no note
{
  const actions = [clip('a', { playbackRate: 0.5 })];
  const notes = await smoothSlowClips(actions, { smoothSlow: async () => ({ skipped: 'a 60 fps clip at 0.5x already has a new picture on every frame' }) }, 30);
  assert.deepEqual(notes, []);
  assert.equal(itemOf(actions[0]!).playbackRate, 0.5);
}

// not possible on this Mac: said once, and no clip after the first batch of requests is asked about
{
  let asked = 0;
  const actions = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => clip(id, { playbackRate: 0.3 }));
  const notes = await smoothSlowClips(actions, { smoothSlow: async () => { asked += 1; return { skipped: 'smooth slow motion needs macOS 15.4 or later', unavailable: true }; } }, 30);
  assert.ok(asked <= 3, `asked ${asked} times`);
  assert.deepEqual(notes, ['slow motion repeats frames: smooth slow motion needs macOS 15.4 or later']);
  assert.ok(actions.every((a) => itemOf(a).playbackRate === 0.3));
}

// several slowed clips are asked for at once, and each gets its own copy
{
  let inFlight = 0, most = 0;
  const actions = ['a', 'b', 'c', 'd', 'e'].map((id) => clip(id, { playbackRate: 0.3 }));
  const notes = await smoothSlowClips(actions, {
    smoothSlow: async (src) => {
      inFlight += 1; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { src: src.replace('.mp4', '.slow.mp4'), width: 1440, height: 2560, frames: 60 };
    },
  }, 30);
  assert.deepEqual(notes, []);
  assert.equal(most, 3, 'three at a time');
  assert.deepEqual(actions.map((a) => itemOf(a).src), ['a', 'b', 'c', 'd', 'e'].map((id) => `/media/uploads/${id}.slow.mp4`));
}

// a failed copy keeps the slowed clip and names it
{
  const actions = [clip('a', { playbackRate: 0.3 })];
  const notes = await smoothSlowClips(actions, { smoothSlow: async () => { throw new Error('encode failed: disk full'); } }, 30);
  assert.deepEqual(notes, ['the slow motion of clip a repeats frames: encode failed: disk full']);
  assert.equal(itemOf(actions[0]!).playbackRate, 0.3);
}

// no smoothing route (an older server) or nothing slowed: nothing to do
assert.deepEqual(await smoothSlowClips([clip('a', { playbackRate: 0.3 })], {}, 30), []);
assert.deepEqual(await smoothSlowClips([clip('a')], { smoothSlow: async () => { throw new Error('not called'); } }, 30), []);

console.log('smoothSlowClips ok');
