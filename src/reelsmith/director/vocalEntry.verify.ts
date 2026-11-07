import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { songVocalStarts } from '../agent/directorVocals';
import { songSuggestion } from '../agent/directorOptions';
import { beatClock, directorRecipe } from './assembleDirector';
import { beatAt, lineEntryBeats, reelVocalStarts, vocalBeats, vocalPhraseStarts } from './vocalEntry';

// --- phrases from a transcript (ms in the song)
const w = (text: string, start: number, end: number) => ({ text, start, end });
const words = [
  w('[Music]', 0, 4000), // not sung
  w('chal', 4100, 4400), w('chala', 4450, 4900), w('chal', 4950, 5300), // phrase at 4.1
  w('kahin', 6200, 6600), w('door', 6600, 7200), // gap 0.9 s: phrase at 6.2 (whisper words abut inside a line)
  w('yahan', 7300, 7700), // gap 0.1 s: same phrase
  w('phir', 7950, 8200), // whisper's 0.25 s between segments: a new line
  w('ooooh', 9000, 12500), // a held note longer than 2.5 s: not a word
  w('phir', 13000, 13300), w('se', 13350, 13500),
];
assert.deepEqual(vocalPhraseStarts(words), [4.1, 6.2, 7.95, 13]);
assert.deepEqual(vocalPhraseStarts(words.slice(0, 4)), [], 'three sung words over a whole song read as an instrumental');
// a line whose first word whisper stretched (heard late) still starts there; a run of stretched words is music
assert.deepEqual(vocalPhraseStarts([...words.slice(1, 6), w('rumdhum', 20000, 23300), w('rath', 23300, 23600), w('dhanan', 23600, 24000)]), [4.1, 6.2, 20]);
const later = words.slice(1, 7).map((x) => w(x.text, x.start + 12000, x.end + 12000));
assert.deepEqual(vocalPhraseStarts([w('baad', 0, 5000), w('baad', 5000, 10000), w('yun', 10000, 15000), ...later]), [16.1, 18.2], 'hallucinated intro words make no phrase');
assert.deepEqual(vocalPhraseStarts(undefined), []);
assert.deepEqual(songVocalStarts({ transcript: words as never }), [4.1, 6.2, 7.95, 13]);
assert.deepEqual(songVocalStarts({ transcript: [] }, words), [4.1, 6.2, 7.95, 13], 'a lyric reel\'s heard words stand in for a missing transcript');
assert.deepEqual(reelVocalStarts([4.1, 6.2, 13, 40], 4, 20), [0.1, 2.2, 9]);

// --- the clock: 120 bpm from 0.2 s, reel starting on that beat
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const clock = beatClock(music, 0.2);
assert.ok(Math.abs(beatAt(clock, 2.25, 40) - 4.5) < 1e-6);
assert.deepEqual(vocalBeats([0.6, 2.24, 30], clock, 32), [1, 4.5]);

// --- when a section's line comes in (section of 8 beats = 4 s from beat 8 = 4.0 s)
assert.equal(lineEntryBeats([4.0], 8, 16, clock), 0, 'a phrase on the cut: with the cut');
assert.equal(lineEntryBeats([3.95], 8, 16, clock), 0, 'a pickup a moment before the cut: with the cut');
assert.ok(Math.abs(lineEntryBeats([4.6], 8, 16, clock) - 1.2) < 1e-6, 'a phrase 0.6 s in: the line waits 1.2 beats');
assert.equal(lineEntryBeats([5.2], 8, 16, clock), 0, 'more than two beats (1 s) in: no wait');
assert.equal(lineEntryBeats([3.5, 6.0], 8, 16, clock), 0, 'mid-phrase at the cut, the next one too late: no wait');
assert.ok(Math.abs(lineEntryBeats([3.5, 4.8], 8, 16, clock) - 1.6) < 1e-6, 'mid-phrase at the cut: waits for the next phrase');
assert.equal(lineEntryBeats([4.5], 8, 10, clock), 0, 'a one-second section has no room to wait (the line keeps a second)');
// a long section still waits two beats at most
assert.equal(lineEntryBeats([5.2], 8, 32, clock), 0);
assert.ok(lineEntryBeats([4.9], 8, 32, clock) > 1.7);

// --- through the assembler: the line of section 2 comes in with the singer; the hook's title stays on frame 0
const fps = 30;
const clip = (id: string, sec: number): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: Math.round(sec * fps), score: 0.5 });
const clips = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => clip(id, 8));
const raw = {
  ratio: '9:16', music: 'song', musicStart: 0.2,
  sections: [
    { move: 'cut', beats: 8, params: { every: 4 }, text: 'the hook', textStyle: 'caption' },
    { move: 'cut', beats: 8, params: { every: 4 }, text: 'we almost turned back', textStyle: 'caption' },
    { move: 'cut', beats: 8, params: { every: 4 }, text: 'worth it', textStyle: 'caption' },
  ],
};
const parsed = parsePlan(raw);
assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join('; '));
const plan = (parsed as { plan: ReelPlan }).plan;
const recipe = directorRecipe(plan);
// singer: a phrase 0.3 s into the reel (section 1), 0.6 s into section 2 (reel 4.6 s), and right on section 3's cut
const vocals = { ...music, vocalStarts: [0.5, 4.8, 8.2] };
const lineStart = (acts: any[], key: string) => Math.min(...acts.filter((a) => a.type === 'add' && a.item.props?.rsLine === key).map((a) => a.startFrame));
const sung = assemble({ recipe, clips, music: vocals, texts: {}, params: {}, seed: 3, plan });
assert.ok(sung.action, sung.report.warnings.join('; '));
const plain = assemble({ recipe, clips, music, texts: {}, params: {}, seed: 3, plan });
const a1 = sung.action!.actions as any[], a0 = plain.action!.actions as any[];
assert.equal(lineStart(a1, 's1'), 0, 'the hook\'s line is on from frame 0');
assert.equal(lineStart(a0, 's2'), Math.round(clock(8) * fps));
assert.equal(lineStart(a1, 's2'), Math.round(4.6 * fps), 'section 2\'s line comes in with the phrase, 0.6 s after the cut');
assert.equal(lineStart(a1, 's3'), lineStart(a0, 's3'), 'a phrase on the cut leaves the line on the cut');
assert.deepEqual(sung.report.lineEntries, [{ section: 1, afterSec: 0.6 }]);
assert.equal(plain.report.lineEntries, undefined);
// the line still ends with its section, and the footage is untouched
const lineEnd = (acts: any[], key: string) => Math.max(...acts.filter((a) => a.type === 'add' && a.item.props?.rsLine === key).map((a) => a.startFrame + a.item.durationInFrames));
assert.equal(lineEnd(a1, 's2'), lineEnd(a0, 's2'));
const footage = (acts: any[]) => acts.filter((a) => a.type === 'add' && a.item.kind === 'video').map((a) => [a.startFrame, a.item.durationInFrames, a.item.srcInFrame]);
assert.deepEqual(footage(a1), footage(a0));
// a shot list keeps the user's timing
const listed = assemble({ recipe, clips, music: vocals, texts: {}, params: {}, seed: 3, plan: { ...plan, shotList: true } as ReelPlan });
assert.equal(listed.report.lineEntries, undefined);

// --- stage 1 hands the agent the beats where the singer comes in
const suggest = songSuggestion({ beatTimesSec: music.beatTimesSec, downbeatIndex: 0 }, 120, 30, undefined, [0.5, 4.8, 8.2]);
assert.deepEqual((suggest as { vocalsAtBeat?: number[] }).vocalsAtBeat, [0.5, 9, 16]);
assert.equal((songSuggestion({ beatTimesSec: music.beatTimesSec, downbeatIndex: 0 }, 120, 30) as { vocalsAtBeat?: number[] }).vocalsAtBeat, undefined);

console.log('vocalEntry.verify: ok');
