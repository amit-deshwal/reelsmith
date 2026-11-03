// Picture-in-picture and film strip: the inset sits in a corner inside Instagram's safe zone, away from the person,
// pops in with its border and shadow and trades places on a swap; the film strip runs its frames one per beat with
// sprocket holes riding along, mounts each frame only while it is on screen, and its last frame grows to the full picture.
import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { safeRect } from '../safeZone';
import { directorRecipe } from './assembleDirector';
import { moveById } from './moves';
import { pipBox, pipCorner, stripGeometry, stripTravel } from './frameMoves';

// ---- geometry ----
const safe = safeRect({ width: 1080, height: 1920 });
for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
  const b = pipBox(1080, 1920, 0.36, corner);
  assert.ok(b.x >= safe.x - 1e-6 && b.x + b.w <= safe.x + safe.w + 1e-6, `${corner} inside the safe width`);
  assert.ok(b.y >= safe.y - 1e-6 && b.y + b.h <= safe.y + safe.h + 1e-6, `${corner} inside the safe height`);
  assert.ok(Math.abs(b.w / b.h - 1080 / 1920) < 1e-9, 'the inset keeps the reel shape');
}
const wide = pipBox(1920, 1080, 0.3, 'bottom-right');
assert.ok(wide.x + wide.w <= 1920 - 40 && wide.y + wide.h <= 1080 - 40, 'a margin on a wide reel');
assert.equal(pipCorner('auto', 0.8), 'top-left', 'away from a person on the right');
assert.equal(pipCorner('auto', 0.2), 'top-right');
assert.equal(pipCorner('auto', undefined), 'top-right');
assert.equal(pipCorner('bottom-left', 0.2), 'bottom-left', 'an asked corner wins');

const tall = stripGeometry(1080, 1920);
assert.ok(tall.vertical && Math.abs(tall.frameAcross / tall.frameAlong - 4 / 3) < 1e-9, 'tall reels run the strip up, 4:3 frames');
assert.ok(tall.stripAt > 0 && tall.stripAt + tall.stripAcross < 1080 && tall.frameAt > tall.stripAt);
assert.ok(!stripGeometry(1920, 1080).vertical, 'wide reels run it across');
const beat = (b: number) => b * 0.5;
const step = stripTravel(beat, 4, 1, 100, 'step', 2);
assert.deepEqual(step[0], [0, 0]);
assert.deepEqual(step.at(-1), [2, 400], 'four pulls in four beats, the last on the beat');
for (let k = 1; k < step.length; k += 2) assert.equal(step[k]![1], step[k - 1]![1], 'holds between pulls');
const scroll = stripTravel(beat, 4, 1, 100, 'scroll', 1.5);
assert.deepEqual(scroll, [[0, 0], [1.5, 300]], 'scroll: one frame a beat, stopped where the section asks');

// ---- built in a plan ----
const fps = 30;
const clip = (id: string, sec: number, kind: 'video' | 'image' = 'video', w = 1080, h = 1920): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind, width: w, height: h, durationInFrames: Math.round(sec * fps), score: 0.5 });
const view = { ...clip('view', 12), sourceAnalysis: { windows: [{ startFrame: 0, endFrame: 360, score: 0.8, focusRect: { x: 0.65, y: 0.3, w: 0.2, h: 0.5 } }] } } as unknown as AssemblyClip;
const clips = [view, clip('face', 12), clip('a', 6), clip('b', 6), clip('c', 6, 'image'), clip('d', 6)];
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const build = (section: Record<string, unknown>) => {
  const parsed = parsePlan({ ratio: '9:16', music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['d'] }, section] });
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const plan = (parsed as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 5, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  return (res.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.props?.rsSection?.startsWith('2-'));
};

// picture-in-picture
const pip = build({ move: 'pip', beats: 8, clips: ['view', 'face'] });
const main = pip.find((a) => (a.item.kind === 'video' && !a.item.name.endsWith('(inset)')))!;
const inset = pip.find((a) => a.item.name.endsWith('(inset)'))!;
const border = pip.find((a) => a.item.name === 'Inset border')!;
const shadow = pip.find((a) => a.item.name === 'Inset shadow')!;
assert.equal(main.item.sourceAssetId, 'view');
assert.equal(main.item.transform, undefined, 'the main shot fills the frame');
assert.equal(inset.item.sourceAssetId, 'face');
const lanes = [main, shadow, border, inset].map((a) => Number(String(a.item.track).replace(/\D/g, '')));
assert.ok(lanes[0]! < lanes[1]! && lanes[1]! < lanes[2]! && lanes[2]! < lanes[3]!, `main, shadow, border, inset from the bottom up: ${lanes}`);
assert.ok(inset.item.transform.x < 0, 'the person is on the right, so the inset is on the left');
assert.ok(inset.item.transform.y < 0, 'at the top');
assert.ok(border.item.transform.scaleX > inset.item.transform.scaleX && border.item.transform.scaleY > inset.item.transform.scaleY, 'the border shows round the inset');
const lineX = (border.item.transform.scaleX - inset.item.transform.scaleX) * 1080, lineY = (border.item.transform.scaleY - inset.item.transform.scaleY) * 1920;
assert.ok(Math.abs(lineX - lineY) < 0.01, 'an even border line');
assert.ok(inset.item.transform.borderRadius > 0, 'rounded');
assert.equal(inset.item.keyframes.opacity.at(-1).value, 1);
assert.equal(shadow.item.keyframes.opacity.at(-1).value, 0.45, 'the shadow keeps its own opacity after the pop');
assert.ok(inset.item.keyframes.scaleX[0].value < inset.item.transform.scaleX && inset.item.keyframes.scaleX.at(-1).value === inset.item.transform.scaleX, 'it pops in');
assert.equal(inset.startFrame, main.startFrame);
assert.equal(inset.item.durationInFrames, main.item.durationInFrames);

const swap = build({ move: 'pip', beats: 8, clips: ['view', 'face'], params: { swap: true, corner: 'bottom-right' } });
const mains = swap.filter((a) => (a.item.kind === 'video' && !a.item.name.endsWith('(inset)'))).sort((x, y) => x.startFrame - y.startFrame);
const insets = swap.filter((a) => a.item.name.endsWith('(inset)')).sort((x, y) => x.startFrame - y.startFrame);
assert.deepEqual(mains.map((a) => a.item.sourceAssetId), ['view', 'face'], 'they trade places');
assert.deepEqual(insets.map((a) => a.item.sourceAssetId), ['face', 'view']);
assert.equal(mains[1]!.startFrame - mains[0]!.startFrame, 4 * 15, 'on the middle beat');
assert.equal(mains[1]!.item.srcInFrame, insets[0]!.item.srcInFrame + 60, 'the face carries on from where it was');
assert.equal(insets[1]!.item.srcInFrame, mains[0]!.item.srcInFrame + 60);
assert.ok(insets.every((a) => a.item.transform.x > 0 && a.item.transform.y > 0), 'the asked corner');

// film strip
const strip = build({ move: 'film-strip', beats: 8, clips: ['a', 'b', 'c', 'd'] });
const g = strip.find((a) => a.item.kind === 'motion-graphic')!;
const back = strip.find((a) => (a.item.name === 'Background' || a.item.name.endsWith('(behind the strip)')))!;
assert.equal(back.item.sourceAssetId, 'a', 'a soft copy of the first clip behind the strip');
assert.ok(back.item.filters.blur > 0);
const { windows, sources } = g.item.props;
const sec = g.item.durationInFrames / fps;
const frames = windows.filter((w: any) => w.s);
const holes = windows.filter((w: any) => !w.s && w.fill !== '#131210');
assert.ok(holes.length >= 8, 'sprocket holes');
assert.ok(frames.length >= 7, `a frame per beat and the ones around them: ${frames.length}`);
assert.equal(Object.keys(sources).length, frames.length, 'each frame plays its own moment');
// never more than five videos mounted at once
for (let t = 0; t < sec; t += 1 / fps) assert.ok(frames.filter((w: any) => t >= w.from && t < w.to).length <= 5, `frames mounted at ${t.toFixed(2)} s`);
for (const w of frames) assert.equal(sources[w.s].fromSec, w.from, 'each frame starts playing as it comes on');
const last = windows.at(-1);
assert.ok(last.s, 'the zoom frame is drawn last');
assert.deepEqual(last.keys.at(-1).win, [0, 0, 1080, 1920], 'and ends filling the picture');
assert.equal(last.to, sec);
const zoomStart = last.keys.at(-2);
const geo = stripGeometry(1080, 1920);
assert.ok(Math.abs(zoomStart.win[1] - (1920 - geo.frameAlong) / 2) < 1, 'it grows from the middle, where the strip stopped');
// the strip moves up a frame on the beat
const first = frames.find((w: any) => w.s === 'f2' || w.keys[0].win[1] === (1920 - geo.frameAlong) / 2)!;
assert.ok(first.keys.at(-1).win[1] < first.keys[0].win[1], 'the strip runs up');
const colour = build({ move: 'film-strip', beats: 6, clips: ['a', 'b', 'c'], params: { backdrop: 'color', background: '#223344', zoom: false, motion: 'scroll' } });
const bg = colour.find((a) => (a.item.name === 'Background' || a.item.name.endsWith('(behind the strip)')))!;
assert.equal(bg.item.kind, 'solid');
assert.equal(bg.item.props.color, '#223344');
const cg = colour.find((a) => a.item.kind === 'motion-graphic')!;
assert.ok(cg.item.props.windows.filter((w: any) => !w.s && w.fill === '#223344').length > 0, 'holes show the background colour');
assert.ok(cg.item.props.windows.filter((w: any) => w.s).every((w: any) => w.keys.every((k: any) => k.linear)), 'scroll is linear');
assert.equal(moveById('film-strip')!.clipCount!(8, {}, 1080, 1920), 8);
console.log('frameMoves: ok');
