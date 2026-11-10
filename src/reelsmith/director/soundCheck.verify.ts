import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { beatClock, directorRecipe } from './assembleDirector';
import { soundCheck } from './soundCheck';

// RS-1220: the reel with eyes closed, on a real build: 120 bpm, first beat at 0.2 s, the drop at beat 8
const fps = 30;
const clip = (id: string, sec: number): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5 });
const clips = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => clip(id, 9 + i));
const beatTimesSec = Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5);
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec, beatsPerBar: 4, downbeatIndex: 0, dropSec: 0.2 + 8 * 0.5 };
const clock = beatClock(music, 0.2);
const beatFrames = beatTimesSec.map((t) => Math.round((t - 0.2) * fps));
const dropFrame = Math.round(clock(8) * fps);
const check = (raw: unknown) => {
  const parsed = parsePlan(raw);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
  const plan = (parsed as { plan: ReelPlan }).plan;
  const out = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 3, plan });
  assert.ok(out.action, out.report.warnings.join('; '));
  return soundCheck({ actions: out.action!.actions, fps, totalFrames: out.report.totalFrames, beatFrames, dropFrame });
};
const good = { ratio: '9:16', music: 'song', sections: [
  { move: 'cut', beats: 8, params: { every: 2 }, text: 'bro lied to me', textStyle: 'rise-lines' },
  { move: 'zoom-punch', beats: 8, transition: 'zoom-through' },
  { move: 'hold', beats: 8, clips: ['f'], text: 'AMK', textStyle: 'big-title' },
] };
assert.deepEqual(check(good), [], 'a reel on the grid is clean');

// a hand-placed whoosh two beats into a hold plays on nothing
const off = check({ ...good, sections: good.sections.map((s, k) => (k === 2 ? { ...s, sounds: [{ id: 'simple-whoosh', beat: 2.5 }] } : s)) });
assert.ok(off.some((f) => /plays on no cut/.test(f.issue) && Math.abs(f.at - clock(18.5)) < 0.1), off.map((f) => f.issue).join(' | '));
// the drop inside a long hold with no hit: nothing lands on it
const flat = check({ ...good, sections: [{ move: 'cut', beats: 4, params: { every: 2 } }, { move: 'hold', beats: 12, clips: ['f'] }, { move: 'hold', beats: 8, clips: ['e'] }] });
assert.ok(flat.some((f) => /drop at .* lands on no cut and no hit/.test(f.issue)), flat.map((f) => f.issue).join(' | '));
// a reel of 22 beats ends mid-bar
const mid = check({ ...good, sections: good.sections.map((s, k) => (k === 2 ? { ...s, beats: 6 } : s)) });
assert.ok(mid.some((f) => /ends on beat 22, mid-bar/.test(f.issue) && /20 or 24/.test(f.fix)), mid.map((f) => f.issue).join(' | '));
// the song started just before a beat (0:54.00 with a beat at 53.95 dropped, the first one left 0.4 s in): the build
// counts that beat as reel beat 1, so a 24-beat reel ends on beat 24, not "beat 23, mid-bar" (run of 2026-11-06)
{
  const late = Array.from({ length: 60 }, (_, i) => Math.round((0.4 + i * 0.5) * fps));
  assert.deepEqual(soundCheck({ actions: [], fps, totalFrames: late[23]!, beatFrames: late }), []);
  assert.ok(soundCheck({ actions: [], fps, totalFrames: late[21]!, beatFrames: late }).some((f) => /ends on beat 22, mid-bar/.test(f.issue)));
}
// a line that starts off the beat (a hand-built item) is named with its time
const odd = soundCheck({ actions: [{ type: 'add', startFrame: 37, item: { id: 'x', kind: 'motion-graphic', track: 'T1', durationInFrames: 30, props: { rsLine: 's9', rsLineText: 'late line' } } } as never], fps, totalFrames: 240, beatFrames });
assert.ok(odd.some((f) => /"late line" comes in at 1.2 s, between beats/.test(f.issue)));
// without a song only the sound-on-nothing check applies
assert.deepEqual(soundCheck({ actions: [], fps, totalFrames: 300, beatFrames: [] }), []);
console.log('soundCheck.verify ok');
