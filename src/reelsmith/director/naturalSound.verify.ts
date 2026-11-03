// RS-1225/1226/1228: what the build does with natural sound, loops and eye trace.
import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { beatClock, directorRecipe } from './assembleDirector';
import { songDuck } from './naturalSound';
import { subjectOnCanvas } from './shotTrace';
import { volumeAtFrame } from '../../editor/keyframes';

const fps = 30;
type Win = NonNullable<AssemblyClip['sourceAnalysis']>['windows'][number];
const windows = (sec: number, extra: Partial<Win>): Win[] => Array.from({ length: Math.ceil(sec / 2) }, (_, i) => ({ startFrame: i * 60, endFrame: Math.min(sec * fps, (i + 1) * 60), score: 0.5, ...extra }));
const clip = (id: string, sec: number, extra: Partial<Win> = {}, more: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: sec * fps, score: 0.5,
  sourceAnalysis: { minShotFrames: 15, windows: windows(sec, extra), shotBoundariesFrame: [] }, ...more,
});
const left = { x: 0.02, y: 0.4, w: 0.2, h: 0.2 }, right = { x: 0.78, y: 0.4, w: 0.2, h: 0.2 }, mid = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
const clips: AssemblyClip[] = [
  clip('talker', 10, { speech: true, focusRect: mid }), clip('l1', 6, { focusRect: left }), clip('r1', 6, { focusRect: right }),
  clip('l2', 6, { focusRect: left }), clip('r2', 6, { focusRect: right }), clip('view', 8, { focusRect: mid }), clip('splash', 6, { focusRect: mid }),
];
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const clock = beatClock(music, 0.2);
const f = (b: number) => Math.round(clock(b) * fps);
const build = (raw: unknown) => {
  const p = parsePlan(raw);
  assert.ok(p.ok, p.ok ? '' : p.errors.join('; '));
  const plan = (p as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
  assert.ok(res.action, res.report.warnings.join('; '));
  const adds = (res.action!.actions as any[]).filter((a) => a.type === 'add');
  return { res, adds, song: adds.find((a) => a.item.kind === 'audio' && a.item.track === 'A1')!.item, section: (n: number) => adds.filter((a) => a.item.props?.rsSection?.startsWith(`${n}-`) && a.item.track === 'V2') };
};

// the plan field: true means under; anything else is refused
assert.equal((parsePlan({ sections: [{ move: 'hold', naturalSound: true }] }) as any).plan.sections[0].naturalSound, 'under');
assert.ok(!parsePlan({ sections: [{ move: 'hold', naturalSound: 'loud' }] }).ok);
assert.ok(!parsePlan({ loop: 'yes', sections: [{ move: 'hold' }] }).ok);

// a section heard under the song: its clip plays with its sound (ramped in and out), the song dips about 12 dB around it
const heard = build({ music: 'song', sections: [
  { move: 'flash-cuts', beats: 4, clips: ['l1', 'r1', 'l2', 'r2'] },
  { move: 'hold', beats: 4, clips: ['talker'], naturalSound: 'under' },
  { move: 'hold', beats: 8, clips: ['view'] },
] });
const talk = heard.section(2)[0].item;
assert.equal(talk.volume, 1);
assert.equal(volumeAtFrame(talk, 0), 0, 'no click at the cut');
assert.equal(volumeAtFrame(talk, Math.floor(talk.durationInFrames / 2)), 1);
assert.equal(heard.section(3)[0].item.volume, 0, 'other sections stay silent');
const s = heard.song;
assert.equal(volumeAtFrame(s, f(2)), 1, 'full song before');
assert.equal(volumeAtFrame(s, f(4)), 0.25, 'dipped from the cut');
assert.equal(volumeAtFrame(s, f(7)), 0.25);
assert.equal(volumeAtFrame(s, f(8) + 8), 1, 'back after it');
assert.ok(s.fadeOutFrames > 0, 'a reel that is not a loop fades its song out');

// solo: the song stops for the section and is back at full on the next section's first beat
const solo = build({ music: 'song', sections: [
  { move: 'hold', beats: 4, clips: ['view'] }, { move: 'hold', beats: 2, clips: ['splash'], naturalSound: 'solo' }, { move: 'zoom-punch', beats: 8, clips: ['l1', 'r1', 'l2', 'r2'] },
] });
assert.equal(volumeAtFrame(solo.song, f(4)), 0);
assert.equal(volumeAtFrame(solo.song, f(6) - 3), 0);
assert.equal(volumeAtFrame(solo.song, f(6)), 1, 'the music lands with the cut');

// talk-zoom is always heard; no song, nothing to duck
const tz = build({ music: 'song', sections: [{ move: 'talk-zoom', beats: 8, clips: ['talker'] }, { move: 'hold', beats: 8, clips: ['view'] }] });
assert.equal(volumeAtFrame(tz.song, f(4)), 0.25);
const silent = parsePlan({ sections: [{ move: 'hold', beats: 4, clips: ['talker'], naturalSound: 'under' }] }) as { plan: ReelPlan };
const quiet = assemble({ recipe: directorRecipe(silent.plan), clips, texts: {}, params: {}, seed: 3, plan: silent.plan });
assert.ok(!(quiet.action!.actions as any[]).some((a) => a.type === 'add' && a.item.kind === 'audio'));

// a loop: the song runs to the last frame
assert.ok(!build({ music: 'song', loop: true, sections: [{ move: 'hold', beats: 8, clips: ['view'] }, { move: 'cut', beats: 8, clips: ['l1', 'r1'] }] }).song.fadeOutFrames);

// eye trace: flash cuts alternating left and right subjects are measured as big jumps; the hold's cut in is not fast
const jumps = heard.res.report.eyeJumps ?? [];
assert.equal(jumps.filter((j) => j.section === 0).length, 7, 'eight half-beat shots, seven cuts');
assert.ok(jumps.filter((j) => j.section === 0).every((j) => j.jump > 0.6), JSON.stringify(jumps));
assert.ok(!jumps.some((j) => j.section === 2), 'a 4 s hold after a 2 s one is not a fast cut');
// the same clips ordered left, left, right, right jump on every other cut
const ordered = build({ music: 'song', sections: [{ move: 'flash-cuts', beats: 4, clips: ['l1', 'l2', 'r1', 'r2'] }, { move: 'hold', beats: 8, clips: ['view'] }] }).res.report.eyeJumps ?? [];
assert.deepEqual(ordered.filter((j) => j.section === 0).map((j) => j.jump > 0.35), [false, true, false, true, false, true, false]);

// a talker muted under the song is reported; heard, it is not
assert.ok(!(heard.res.report.voices ?? []).some((v) => v.section === 1));
const muted = build({ music: 'song', sections: [{ move: 'hold', beats: 8, clips: ['talker'] }, { move: 'hold', beats: 8, clips: ['view'] }] });
assert.deepEqual((muted.res.report.voices ?? []).map((v) => v.section), [0]);

// subjects on the canvas: a portrait clip in 9:16 is not cropped; a landscape one is slid to centre its subject
assert.deepEqual(subjectOnCanvas(left, { width: 1080, height: 1920 }, 1080, 1920), { x: 0.12, y: 0.5 });
assert.equal(subjectOnCanvas(mid, { width: 1920, height: 1080 }, 1080, 1920)!.x, 0.5);
assert.ok(subjectOnCanvas(left, { width: 1920, height: 1080 }, 1080, 1920)!.x < 0.5, 'at the edge the crop runs out of picture');
assert.equal(subjectOnCanvas({ x: 0, y: 0, w: 1, h: 1 }, { width: 1080, height: 1920 }, 1080, 1920), undefined);

// the duck: neighbouring stretches merge, a stretch at the reel start dips from frame 0
assert.deepEqual(songDuck([{ from: 0, to: 30, solo: false }], 1, 300, 30), [{ frame: 0, value: 0.25 }, { frame: 30, value: 0.25 }, { frame: 38, value: 1 }]);
assert.deepEqual(songDuck([{ from: 60, to: 90, solo: false }, { from: 92, to: 120, solo: false }], 1, 300, 30), [{ frame: 0, value: 1 }, { frame: 55, value: 1 }, { frame: 60, value: 0.25 }, { frame: 120, value: 0.25 }, { frame: 128, value: 1 }], 'one dip, not two');

// RS-1258: a quiet clip is levelled. Its loudest window decides; it is raised up to +6 dB (the editor's volume tops out at 2)
// and the song dips up to 8 dB further for what is left; a loud clip (a shout) is never turned down
{
  const { levelNatural, sourceLevel } = await import('./naturalSound');
  assert.deepEqual(levelNatural(undefined), { clipGain: 1, songFactor: 1 }, 'not measured: as before');
  assert.deepEqual(levelNatural(-12), { clipGain: 1, songFactor: 1 }, 'a shout stays as it is');
  assert.deepEqual(levelNatural(-23), { clipGain: 1.41, songFactor: 1 }, '+3 dB on the clip');
  assert.deepEqual(levelNatural(-30), { clipGain: 2, songFactor: 0.631 }, 'the -30 dB selfie: +6 dB, and the song 4 dB lower');
  assert.deepEqual(levelNatural(-45), { clipGain: 2, songFactor: 0.398 }, 'capped at +6 and 8 dB more dip');
  const wins = [{ startFrame: 0, endFrame: 60, level: -34 }, { startFrame: 60, endFrame: 120, level: -27 }, { startFrame: 120, endFrame: 180 }];
  assert.equal(sourceLevel(wins, 30, 90), -27, 'the loudest window it overlaps');
  assert.equal(sourceLevel(wins, 125, 170), undefined, 'a silent stretch has no level');
  assert.equal(sourceLevel(undefined, 0, 60), undefined);
  // the song under a quiet clip, and two merged stretches dip as far as the quieter needs
  assert.deepEqual(songDuck([{ from: 60, to: 90, solo: false, songFactor: 0.5 }], 1, 300, 30).find((k) => k.frame === 60)?.value, 0.125);
  assert.equal(songDuck([{ from: 60, to: 90, solo: false, songFactor: 0.8 }, { from: 92, to: 120, solo: false, songFactor: 0.5 }], 1, 300, 30).find((k) => k.frame === 60)?.value, 0.125);
  // through the build: the quiet talking clip (-30) plays at 2 with its ramps, the song at 0.25 x 0.631 under it
  const quiet = clip('selfie', 10, { speech: true, focusRect: mid, level: -30 });
  const plan = (parsePlan({ music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['view'] }, { move: 'hold', beats: 4, clips: ['selfie'], naturalSound: 'under' }, { move: 'hold', beats: 4, clips: ['view'] }] }) as { plan: ReelPlan }).plan;
  const res = assemble({ recipe: directorRecipe(plan), clips: [...clips, quiet], music, texts: {}, params: {}, seed: 3, plan });
  const adds = (res.action!.actions as any[]).filter((a) => a.type === 'add');
  const selfie = adds.find((a) => a.item.sourceAssetId === 'selfie')!.item;
  assert.equal(selfie.volume, 2);
  assert.equal(volumeAtFrame(selfie, 0), 0, 'still no click at the cut');
  assert.equal(volumeAtFrame(selfie, Math.floor(selfie.durationInFrames / 2)), 2);
  const song = adds.find((a) => a.item.kind === 'audio' && a.item.track === 'A1')!.item;
  assert.ok(Math.abs(volumeAtFrame(song, f(6)) - 0.25 * 0.631) < 1e-6, `the song dips further (${volumeAtFrame(song, f(6))})`);
  // a clip at a normal talking level keeps volume 1 and the usual dip
  assert.equal(heard.section(2)[0].item.volume, 1);
}

// RS-1258: a J-cut. The first heard clip's own sound comes in 0.2 s before its picture, from the source just before its
// in-point, fading up; the clip then carries on at its level (no dip at the cut), and the song is already down for it
{
  const { JCUT_LANE } = await import('./naturalSound');
  const lead = Math.round(0.2 * fps);
  const j = build({ music: 'song', sections: [
    { move: 'hold', beats: 4, clips: ['view'] },
    { move: 'hold', beats: 4, clips: ['talker@3'], naturalSound: 'under' },
    { move: 'hold', beats: 4, clips: ['view@4'] },
  ] });
  const cut = f(4);
  const talkerItem = j.adds.find((a) => a.item.sourceAssetId === 'talker' && a.item.kind === 'video')!;
  const leadIn = j.adds.find((a) => a.item.props?.rsJcut)!;
  assert.ok(leadIn, 'a lead-in is laid');
  assert.equal(leadIn.item.track, JCUT_LANE);
  assert.equal(leadIn.item.kind, 'audio');
  assert.equal(leadIn.startFrame, talkerItem.startFrame - lead, 'it ends on the cut');
  assert.equal(leadIn.item.durationInFrames, lead);
  assert.equal(leadIn.item.srcInFrame, talkerItem.item.srcInFrame - lead, 'the sound just before the in-point, so it runs straight on');
  assert.equal(volumeAtFrame(leadIn.item, 0), 0, 'it fades up');
  assert.equal(volumeAtFrame(leadIn.item, lead), 1);
  assert.equal(volumeAtFrame(talkerItem.item, 0), 1, 'the clip carries on at its level: no dip at the cut');
  assert.equal(volumeAtFrame(talkerItem.item, talkerItem.item.durationInFrames), 0, 'and still ramps out');
  assert.equal(talkerItem.startFrame, cut);
  assert.ok(volumeAtFrame(j.song, cut - lead) <= 0.25 + 1e-9, 'the song is down when the lead-in starts');
  assert.equal(volumeAtFrame(j.song, cut - lead - Math.round(0.15 * fps) - 1), 1, 'and full just before it dips');
  // solo keeps the song's stop on the beat; the lead-in plays over its last moment
  const soloJ = build({ music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['view'] }, { move: 'hold', beats: 2, clips: ['splash@2'], naturalSound: 'solo' }, { move: 'hold', beats: 4, clips: ['view@4'] }] });
  assert.ok(soloJ.adds.some((a) => a.item.props?.rsJcut), 'solo gets a lead-in too');
  assert.equal(volumeAtFrame(soloJ.song, f(4) - lead), 1, 'the song still stops on the beat, not before');
  // no room before the in-point, or the reel's first frame: no lead-in, and the clip ramps in as before
  const none = build({ music: 'song', sections: [{ move: 'hold', beats: 4, clips: ['talker'], naturalSound: 'under' }, { move: 'hold', beats: 4, clips: ['view'] }, { move: 'hold', beats: 4, clips: ['splash'], naturalSound: 'under' }] });
  assert.equal(none.adds.filter((a) => a.item.props?.rsJcut).length, 0);
  assert.equal(volumeAtFrame(none.adds.find((a) => a.item.sourceAssetId === 'splash' && a.item.kind === 'video')!.item, 0), 0);
}

console.log('naturalSound.verify: ok');
