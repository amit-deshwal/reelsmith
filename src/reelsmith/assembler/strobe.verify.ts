import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../../app/appShell';
import { historyReduce, type History } from '../../editor/reduce';
import { activeTimeline } from '../../editor/types';
import { strobeForTimeline } from '../strobeAction';
import { planStrobe, type StrobeOptions } from './strobe';
import type { AssemblyClip } from './types';

const FPS = 30;
const beats = Array.from({ length: 80 }, (_, i) => i * 0.5); // 120 bpm, downbeat first
const vid = (i: number, frames = 300): AssemblyClip => ({ assetId: `c${i}`, name: `c${i}`, src: `/c${i}.mp4`, kind: 'video', durationInFrames: frames, score: 1 - i * 0.05 });
const base: StrobeOptions = { mode: 'opener', clips: Array.from({ length: 8 }, (_, i) => vid(i)), beatsSec: beats, beatsPerBar: 4, fps: FPS, anchorFrame: 7, seed: 1 };
const frameOfBeat = (f: number) => beats.some((b) => Math.round(b * FPS) === f);

// opener: 3 flashes, default 1.5 s, every cut on a beat, no frame repeated
const a = planStrobe(base);
assert.deepEqual(a.warnings, []);
assert.equal(a.shots.length, 3);
assert.equal(a.endFrame - a.startFrame, 45, '1.5 s at 30 fps');
for (const s of a.shots) assert.ok(frameOfBeat(s.startFrame), `cut ${s.startFrame} on a beat`);
assert.ok(frameOfBeat(a.endFrame));
assert.equal(a.startFrame, 15, 'starts on the first beat at or after the anchor');
const key = (s: { assetId: string; srcInFrame: number }) => `${s.assetId}@${s.srcInFrame}`;
assert.equal(new Set(a.shots.map(key)).size, 3);
assert.equal(new Set(a.shots.map((s) => s.assetId)).size, 3, 'different clips when there are enough');
assert.equal(JSON.stringify(a), JSON.stringify(planStrobe(base)), 'deterministic');
// shots are adjacent, flash transitions sit between them
const adds = a.actions.filter((x) => x.type === 'add') as any[];
assert.deepEqual(adds.map((x) => x.startFrame + x.item.durationInFrames), [adds[1].startFrame, adds[2].startFrame, a.endFrame]);
const trs = a.actions.filter((x) => x.type === 'addTransition') as any[];
assert.equal(trs.length, 2);
assert.ok(trs.every((t) => t.transType === 'flash'));
assert.equal(planStrobe({ ...base, accent: false }).actions.filter((x) => x.type === 'addTransition').length, 0);

// params: total length and flash length
const long = planStrobe({ ...base, lengthSec: 2.5, flashSec: 0.5 });
assert.equal(long.shots.length, 5);
assert.equal(long.endFrame - long.startFrame, 75);
const fast = planStrobe({ ...base, lengthSec: 1.2, flashSec: 0.3 });
assert.ok(fast.endFrame - fast.startFrame >= 30 && fast.shots.every((s) => s.durationInFrames >= 9 && s.durationInFrames <= 18));
assert.equal(planStrobe({ ...base, flashSec: 5 }).shots[0]!.durationInFrames, 15, 'flash length is clamped to 0.6 s at most (one 0.5 s beat)');
// slow music subdivides the beat so a flash stays <= 0.6 s
const slow = planStrobe({ ...base, beatsSec: Array.from({ length: 40 }, (_, i) => i * 1.0), anchorFrame: 0 });
assert.ok(slow.shots.every((s) => s.durationInFrames <= 18), 'flash <= 0.6 s at 60 bpm');
assert.ok(slow.shots.every((s) => s.startFrame % 15 === 0), 'cuts on half beats');

// one clip with plenty of footage: different, non-overlapping parts
const one = planStrobe({ ...base, clips: [vid(0, 600)] });
assert.deepEqual(one.warnings, []);
assert.equal(one.shots.length, 3);
const ranges = one.shots.map((s) => [s.srcInFrame, s.srcInFrame + s.durationInFrames]).sort((p, q) => p[0]! - q[0]!);
for (let i = 1; i < ranges.length; i += 1) assert.ok(ranges[i]![0]! >= ranges[i - 1]![1]!, 'no source frame is shown twice');
// not enough footage: warns instead of repeating a frame
const tiny = planStrobe({ ...base, clips: [vid(0, 20)] });
assert.equal(tiny.shots.length, 1);
assert.ok(tiny.warnings[0]!.includes('different footage'));
// a still image is used once only
const img = planStrobe({ ...base, clips: [{ ...vid(0), kind: 'image' as const }] });
assert.equal(img.shots.length, 1);

// closer: ends on a bar line at or before the anchor
const c = planStrobe({ ...base, mode: 'closer', anchorFrame: 20 * FPS + 9 });
assert.equal(c.shots.length, 3);
assert.equal(c.endFrame, 20 * FPS, 'bar line (every 2 s at 120 bpm)');
assert.equal(c.endFrame - c.startFrame, 45);
assert.ok(c.shots.every((s) => frameOfBeat(s.startFrame)));
assert.notEqual(c.actions.find((x: any) => x.item)?.type, undefined);
// grid too short
assert.ok(planStrobe({ ...base, beatsSec: [0, 0.5, 1] }).warnings[0]!.includes('too short'));

// ---- on a real timeline: the agent/recipe batch ----
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
const grid = { beatTimesSec: beats, beatsPerBar: 4, downbeatIndex: 0 };
h = historyReduce(h, { type: 'add', startFrame: 0, item: { id: 'song', track: 'A1', kind: 'audio', name: 'song', src: '/s.mp3', durationInFrames: 40 * FPS, props: { rsBeats: grid } } } as never);
h = historyReduce(h, { type: 'add', startFrame: 0, item: { id: 'main', track: 'V1', kind: 'video', name: 'main', src: '/m.mp4', durationInFrames: 20 * FPS } } as never);
const assets = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, kind: 'video', name: `a${i}`, src: `/a${i}.mp4`, durationInFrames: 300 })) as never[];
const tl = () => activeTimeline(h.present);
const open = strobeForTimeline(tl(), assets, { mode: 'opener', seed: 3 });
assert.ok(open.ok);
const before = h.past.length;
h = historyReduce(h, { type: 'batch', label: open.ok ? open.label : '', actions: open.ok ? open.actions : [] });
assert.equal(h.past.length, before + 1, 'one undo step');
const hook = tl().items.filter((i) => (i.props as any)?.rsSection === 'strobe-open');
assert.equal(hook.length, 3);
assert.ok(hook.every((i) => i.track !== 'V1'), 'own track above the reel');
assert.ok(hook.every((i) => frameOfBeat(i.startFrame)), 'opener cuts on beats');
assert.equal((tl().transitions ?? []).filter((t) => t.type === 'flash').length, 2);
assert.equal(tl().items.find((i) => i.id === 'main')!.startFrame, 0, 'the reel underneath is untouched');
// running it again replaces the first hook
const again = strobeForTimeline(tl(), assets, { mode: 'opener', seed: 4, lengthSec: 1 });
assert.ok(again.ok);
h = historyReduce(h, { type: 'batch', label: 'x', actions: again.ok ? again.actions : [] });
assert.equal(tl().items.filter((i) => (i.props as any)?.rsSection === 'strobe-open').length, 2, '1 s hook = 2 flashes, old ones removed');
// closer ends on a bar line at/before the end of the reel (20 s)
const close = strobeForTimeline(tl(), assets, { mode: 'closer', seed: 5 });
assert.ok(close.ok && close.plan.endFrame === 20 * FPS && close.plan.shots.length === 3);
h = historyReduce(h, { type: 'undo' } as never);
h = historyReduce(h, { type: 'undo' } as never);
assert.equal(tl().items.filter((i) => (i.props as any)?.rsSection === 'strobe-open').length, 0, 'undo removes the hook');
// no music grid
let bare: History = { past: [], present: emptyProjectDoc(), future: [] };
bare = historyReduce(bare, { type: 'add', startFrame: 0, item: { id: 'main', track: 'V1', kind: 'video', name: 'm', src: '/m.mp4', durationInFrames: 90 } } as never);
const noGrid = strobeForTimeline(activeTimeline(bare.present), assets, { mode: 'opener', seed: 1 });
assert.ok(!noGrid.ok && noGrid.error.includes('beat grid'));
console.log('strobe.verify ok');
