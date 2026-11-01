import assert from 'node:assert/strict';
import { bestMoments, motionAt, shotLogLines, type ShotLogClip } from './shotLog';
import type { WindowFeatures } from '../assembler/scoring';

const fps = 30;
const win = (from: number, o: Partial<WindowFeatures> = {}): WindowFeatures => ({ startFrame: from * fps, endFrame: (from + 2) * fps, sharpness: 0.6, exposure: 0.9, motion: 0.02, subject: 0.1, speech: false, ...o });
// a 20 s climb: blurry start, a talking selfie, the climb moving hard at 10-14 s
const climb: ShotLogClip = {
  n: 1, kind: 'video', seconds: 20, shape: 'portrait',
  features: { assetId: 'a', dHash: '0', windows: [
    win(0, { sharpness: 0.05 }), win(2, { speech: true, face: 0.05 }), win(4, { speech: true, face: 0.05 }), win(6), win(8),
    win(10, { motion: 0.3, subject: 0.3 }), win(12, { motion: 0.35, subject: 0.3 }), win(14), win(16), win(18),
  ], shotBoundariesFrame: [] },
  tags: { scores: { action: 0.5, scenery: 0.2 } as never, top: 'action', confidence: 0.5, samples: 4 },
};
const view: ShotLogClip = { n: 2, kind: 'video', seconds: 8, features: { assetId: 'b', dHash: '0', windows: [win(0, { motion: 0.004 }), win(2, { motion: 0.004 }), win(4, { motion: 0.004 }), win(6, { motion: 0.004 })] } };
const photo: ShotLogClip = { n: 3, kind: 'image', seconds: 3 };
const bare: ShotLogClip = { n: 4, kind: 'video', seconds: 10, features: null };

const m = bestMoments(climb, 3, fps);
assert.equal(m.length, 3);
assert.ok(m.some((t) => t >= 10 && t <= 14), `the climb's moving part is a best moment (${m})`);
assert.ok(!m.some((t) => t < 2), 'the blurry first window is never a pick');
assert.deepEqual([...m].sort((a, b) => a - b), m, 'moments in time order');
// no analysis: the old fixed points, each leaving room for a shot after it
assert.deepEqual(bestMoments(bare, 4, fps), [1, 3.7, 6.3, 8]);
assert.ok(m.every((t) => t <= 18), 'no moment in the last two seconds');
assert.deepEqual(bestMoments(photo, 4, fps), [0]);

const { lines, moments } = shotLogLines([climb, view, photo, bare], fps, 3);
assert.match(lines[0]!, /^#1 20s video portrait · person moving, wide scenery · best @1[0-3]/);
assert.match(lines[0]!, /moving 10-14s/);
assert.match(lines[0]!, /talking 2-6s/);
assert.match(lines[0]!, /soft\/dark 0-2s/);
assert.match(lines[0]!, /face/);
assert.match(lines[1]!, /still throughout/);
assert.equal(lines[2], '#3 3s photo');
assert.match(lines[3]!, /not analysed/);
assert.deepEqual(moments.get(3), [0]);
assert.equal(moments.get(1)!.length, 3);
// a log line stays short: 60 clips must fit well under the 16k tool result cap
assert.ok(lines.every((l) => l.length < 160), lines.join('\n'));

assert.equal(motionAt(climb, 12, fps, [climb, view]), 'moving');
assert.equal(motionAt(view, 3, fps, [climb, view]), 'still');
assert.equal(motionAt(climb, 3, fps, [climb, view]), 'some');
assert.equal(motionAt(photo, 0, fps, [climb]), 'still');
console.log('shotLog ok');

// RS-1240: the local clock time each clip was filmed
{
  const { filmedLabels } = await import('./shotLog');
  const ist = 330;
  const at = (iso: string) => Date.parse(iso);
  assert.deepEqual(filmedLabels([at('2026-10-18T22:42:00Z'), at('2026-10-19T01:15:00Z'), undefined], ist), ['4:12 am', '6:45 am', undefined]);
  // over two days the day is counted from the first clip's day
  assert.deepEqual(filmedLabels([at('2026-10-18T06:30:00Z'), at('2026-10-19T00:05:00Z')], ist), ['day 1 · 12:00 pm', 'day 2 · 5:35 am']);
  // one timed clip, or bogus 1970 dates, say nothing
  assert.deepEqual(filmedLabels([at('2026-10-18T06:30:00Z'), undefined], ist), [undefined, undefined]);
  assert.deepEqual(filmedLabels([0, 1000], ist), [undefined, undefined]);
  // a 360 export saved two days later is not part of the shoot (the AMK clips: 7 on 10 Oct, 2 exports on 12 Oct)
  assert.deepEqual(filmedLabels([at('2026-10-10T00:18:41Z'), at('2026-10-10T03:56:53Z'), at('2026-10-12T16:33:18Z')], ist), ['5:48 am', '9:26 am', undefined]);
  console.log('shotLog filmed: ok');
}
