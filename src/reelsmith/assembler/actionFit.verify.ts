import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../../../server/media-binaries.ts';
import { extractClipFeatures } from '../../../server/reelsmith/clipFeatures.ts';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { directorRecipe } from '../director/assembleDirector';
import { cutMotion, fitAction, motionAt, nearbyPeak } from './actionFit';
import { pickMoment } from './moments';

const fps = 30;
// 4 samples a second over 8 s: handheld drift (0.03) with one movement from 3.75 to 4.5 s (samples 16-18: the changes
// 3.75-4.0, 4.0-4.25 and 4.25-4.5 s)
const values = Array.from({ length: 33 }, (_, i) => (i >= 16 && i <= 18 ? [0.3, 0.5, 0.35][i - 16]! : 0.03));
const curve = { hz: 4, values };
const F = (sec: number) => Math.round(sec * fps);
const calm = (s: number, len: number) => cutMotion(curve, fps, s, len) < 0.1;

// --- motion at a moment: a sample sits at the middle of the quarter second it measures
assert.ok(Math.abs(motionAt(curve, 4.125) - 0.5) < 1e-9, 'the middle of the fastest quarter second');
assert.ok(Math.abs(motionAt(curve, 4.0) - 0.4) < 1e-9, 'between two moving samples');
assert.ok(motionAt(curve, 3.5) < 0.04 && motionAt(curve, 4.75) < 0.04, 'calm a quarter second before and after');
assert.ok(nearbyPeak(curve, fps, F(3), F(1.5), F(0.5)) === 0.5, 'a clear movement near the shot');
assert.equal(nearbyPeak(curve, fps, F(0), F(1.5), F(0.5)), 0, 'nothing near the first seconds');
assert.equal(nearbyPeak({ hz: 4, values: values.map(() => 0.2) }, fps, F(3), F(2), F(0.5)), 0, 'steady movement (a walk, a pan) has no peak');

// --- nudging a start: the 1.5 s shot from 3.0 s is cut while the movement is at its fastest
assert.ok(!calm(F(3), F(1.5)));
const moved = fitAction(curve, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) });
assert.ok(moved > F(3) && moved <= F(3.5) && calm(moved, F(1.5)), `moved ${(moved - F(3)) / fps} s so both cuts are calm`);
assert.ok(!calm(moved - 4, F(1.5)), 'about the smallest move that does it');
assert.equal(fitAction(curve, fps, F(1), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) }), F(1), 'nothing near: left alone');
assert.equal(fitAction(curve, fps, F(3.4), F(2), { lo: 0, hi: F(6), maxShift: F(0.5) }), F(3.4), 'already holds the whole movement');
assert.equal(fitAction(curve, fps, F(4.6), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) }), F(4.6), 'starts just after it settles: left alone');
const early = fitAction(curve, fps, F(4.2), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) });
assert.ok(early > F(4.2) && calm(early, F(1.5)), 'a start in the movement moves past it, never back into it');
assert.equal(fitAction(curve, fps, F(3), F(1.5), { lo: 0, hi: F(3.1), maxShift: F(0.5) }), F(3), 'never past the room it has');
assert.equal(fitAction(curve, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5), ok: (s) => s < F(3.1) }), F(3), 'a vetoed start is not taken');
assert.equal(fitAction(undefined, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) }), F(3), 'no curve (an old analysis): left alone');
// a camera busy all through (median 0.35) has no calm frame to find; one not quite as calm as the clip allows is not taken
const busy = { hz: 4, values: values.map((v) => (v === 0.03 ? 0.35 : 1)) };
assert.equal(fitAction(busy, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) }), F(3), 'a busy clip: left alone');
const restless = { hz: 4, values: values.map((v, i) => (v !== 0.03 ? v : i >= 12 && i <= 22 ? 0.25 : 0.06)) };
assert.equal(fitAction(restless, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) }), F(3), 'no cut within reach as calm as the clip (0.12 here): left alone');

// --- the moment picker: the best-scoring stretch starts at 2.9 s and is cut mid-movement; the fit moves it
const clip = (id: string, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: F(8), score: 0.5,
  sourceAnalysis: { minShotFrames: 15, windows: [{ startFrame: 0, endFrame: F(2.9), score: 0.3 }, { startFrame: F(2.9), endFrame: F(4.4), score: 0.9 }, { startFrame: F(4.4), endFrame: F(8), score: 0.86 }], shotBoundariesFrame: [], motionCurve: curve },
  ...extra,
});
const plainPick = pickMoment(clip('a'), F(1.5), [], 15)!;
const fitPick = pickMoment(clip('a'), F(1.5), [], 15, fps)!;
assert.ok(!calm(plainPick, F(1.5)), `without fps the old pick (${plainPick / fps} s) cuts mid-movement`);
assert.ok(fitPick !== plainPick && Math.abs(fitPick - plainPick) <= F(0.5) && calm(fitPick, F(1.5)), `with fps the shot (${fitPick / fps} s) has calm cuts`);

// --- through the director: the agent's "@3" moves to hold the action; a shot list's does not
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const raw = { ratio: '9:16', music: 'song', musicStart: 0, sections: [{ move: 'cut', beats: 4, clips: ['b'] }, { move: 'cut', beats: 3, clips: ['a@3'], params: { every: 3 } }, { move: 'cut', beats: 4, clips: ['b'] }] };
const parsed = parsePlan(raw);
assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
const plan = (parsed as { plan: ReelPlan }).plan;
const clips = [clip('a'), clip('b', { sourceAnalysis: undefined })];
const inOf = (r: ReturnType<typeof assemble>) => (r.action!.actions as any[]).find((x) => x.type === 'add' && x.item.props?.rsSection === '2-cut' && x.item.kind === 'video')?.item.srcInFrame;
const built = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 1, plan });
assert.ok(built.action, built.report.warnings.join('; '));
assert.equal(inOf(built), moved);
assert.deepEqual(built.report.actionFits, [{ section: 1, assetId: 'a', shiftSec: Math.round(((moved - F(3)) / fps) * 100) / 100 }]);
assert.equal(built.report.sectionMoments?.[1]?.[0], moved, 'a fix replays the moved start');
const listed = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 1, plan: { ...plan, shotList: true } as ReelPlan });
assert.equal(inOf(listed), F(3));
assert.equal(listed.report.actionFits, undefined);

// --- the analysis measures it: a box that darts across the frame between 4.0 and 4.6 s
const dir = mkdtempSync(join(tmpdir(), 'rs-action-'));
try {
  const file = join(dir, 'dart.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=320x240:rate=30:d=8', '-f', 'lavfi', '-i', 'color=c=white:size=60x60:rate=30:d=8',
    '-filter_complex', "[0:v][1:v]overlay=x='if(lt(t,4),20,if(lt(t,4.6),20+400*(t-4),260))':y=90", '-pix_fmt', 'yuv420p', file]);
  const f = await extractClipFeatures(file, 'dart', fps);
  assert.equal(f.motionCurve?.hz, 4);
  const v = f.motionCurve!.values;
  const peakAt = v.indexOf(Math.max(...v)) / 4;
  assert.ok(peakAt > 4 && peakAt <= 4.75, `motion peaks at ${peakAt} s`);
  assert.ok(Math.max(...v.slice(0, 15)) < 0.02 && Math.max(...v.slice(21)) < 0.02, 'still before and after');
  const s = fitAction(f.motionCurve, fps, F(3), F(1.5), { lo: 0, hi: F(6.5), maxShift: F(0.5) });
  assert.ok(s > F(3) && (s + F(1.5)) / fps >= 4.6, `the real clip's shot moved to ${s / fps} s and holds the dart`);
  // a handheld-style wobble (the whole frame shifting a few pixels) is not movement in the shot
  const wobble = join(dir, 'wobble.mp4');
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'smptehdbars=size=360x280:rate=30:d=4', '-vf', "crop=320:240:'20+8*sin(t*5)':'20+8*cos(t*4)'", '-pix_fmt', 'yuv420p', wobble]);
  const wv = (await extractClipFeatures(wobble, 'wobble', fps)).motionCurve!.values;
  assert.ok(Math.max(...wv) < 0.15, `a wobbling camera reads ${Math.max(...wv)} (under an action's 0.15)`);
  console.log('actionFit.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
