// RS-1251: a director reel led by the user's narration: played whole, never ducked or cut, words as captions, the song
// under it, nothing talking over it.
import assert from 'node:assert/strict';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { resolveCaptionProjection } from '../../captions/resolve';
import { volumeAtFrame } from '../../editor/keyframes';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import type { AssemblyVoiceover } from '../assembler/types';
import { bindTracks } from '../trackBinding';
import { directorRecipe } from './assembleDirector';
import { NATURAL_UNDER } from './naturalSound';
import { speechWindows, voiceLines, VOICE_LANE } from './voiceover';
import { speechShareOfPcm } from '../../../server/reelsmith/clipFeatures';

const fps = 30;
const clip = (id: string, sec: number, speech = false): AssemblyClip => ({
  assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: sec * fps, score: 0.5,
  sourceAnalysis: { minShotFrames: 15, windows: Array.from({ length: Math.ceil(sec / 2) }, (_, i) => ({ startFrame: i * 60, endFrame: Math.min(sec * fps, (i + 1) * 60), score: 0.5, ...(speech ? { speech: true } : {}) })), shotBoundariesFrame: [] },
});
const clips = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => clip(id, 10, i === 0));
// the Pune Trekkers narration (Mawal 3.m4a): six sentences over 23.7 s
const said = [
  [0.0, 3.7, 'Did you know Pune has a trekking community that\'s completely free?'],
  [3.7, 6.3, 'No joining fee, nobody makes a profit.'],
  [6.3, 10.5, 'We just split the real cost, travel, food, entry, that\'s it.'],
  [10.5, 15.8, 'Three years of treks and somewhere along the way strangers became close friends.'],
  [15.8, 20.2, 'First trek coming along, not super fit, honestly you will fit right in.'],
  [20.2, 23.7, 'Come on our next trek, link is in the bio, see you on the trail.'],
] as const;
const words = said.flatMap(([from, to, text]) => {
  const ws = text.split(' ');
  const step = (to - from) / ws.length;
  return ws.map((w, k) => ({ text: w, start: Math.round((from + k * step) * 1000), end: Math.round((from + (k + 0.9) * step) * 1000) }));
});
const voice: AssemblyVoiceover = { assetId: 'vo', name: 'Mawal 3.m4a', src: '/media/uploads/vo.m4a', kind: 'audio', durationSec: 23.8, transcript: words };
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 90, beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.2 + i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const sections = (secs: number[]) => secs.map((seconds, i) => ({ move: 'cut', seconds, clips: [['a', 'b', 'c', 'd', 'e', 'f'][i % 6]!] }));
const build = (raw: Record<string, unknown>, opts: { music?: boolean; voice?: AssemblyVoiceover | null } = {}) => {
  const p = parsePlan(raw);
  assert.ok(p.ok, p.ok ? '' : p.errors.join('; '));
  const plan = (p as { plan: ReelPlan }).plan;
  const v = opts.voice === null ? undefined : opts.voice ?? voice;
  return assemble({ recipe: directorRecipe(plan), clips, ...(opts.music ? { music } : {}), ...(v ? { voiceover: v } : {}), texts: {}, params: {}, seed: 4, plan });
};

// the plan fields; the narration can never also be the song
assert.equal((parsePlan({ voiceover: 'vo', voiceoverStart: 0.4, captions: false, sections: [{ move: 'hold' }] }) as any).plan.voiceover, 'vo');
assert.equal((parsePlan({ voiceover: 'vo', voiceoverStart: 0.4, sections: [{ move: 'hold' }] }) as any).plan.voiceoverStart, 0.4);
assert.equal((parsePlan({ voiceover: 'vo', captions: false, sections: [{ move: 'hold' }] }) as any).plan.captions, false);
assert.ok(!parsePlan({ voiceover: 'vo', music: 'vo', sections: [{ move: 'hold' }] }).ok);
assert.ok(!parsePlan({ voiceover: 'vo', voiceoverStart: -1, sections: [{ move: 'hold' }] }).ok);

// the last session's failure: a 21.5 s reel on a 23.8 s narration would cut "see you on the trail"; it is refused
const short = build({ voiceover: 'vo', sections: sections([3.7, 2.6, 4.2, 5.3, 4.4, 1.3]) });
assert.equal(short.action, null);
assert.match(short.report.warnings.join(' '), /voiceover runs 23\.8 s.*never cut/);

// cut to its lines (no song): the narration plays whole, at full level, never ducked or faded, on its own top lane
const solo = build({ voiceover: 'vo', sections: sections([3.7, 2.6, 4.2, 5.3, 4.4, 4.1]) });
assert.ok(solo.action, solo.report.warnings.join('; '));
const acts = solo.action!.actions as any[];
const vo = acts.find((a) => a.type === 'add' && a.item.track === VOICE_LANE);
assert.ok(vo, 'the voiceover is placed');
assert.equal(vo.startFrame, 0);
assert.equal(vo.item.durationInFrames, Math.round(23.8 * fps));
assert.equal(vo.item.volume, 1);
assert.equal(vo.item.keyframes, undefined, 'never ducked');
assert.equal(vo.item.fadeOutFrames, undefined, 'never faded');
assert.equal(vo.item.transcript.length, words.length);
// the clips are silent under it (without a song they would otherwise play their own sound)
for (const a of acts.filter((x) => x.type === 'add' && x.item.kind === 'video')) assert.equal(a.item.volume ?? 0, 0, `${a.item.id} is silent under the voice`);
// its words become captions on a caption track, all of them, in order
const captions = acts.find((a) => a.type === 'setCaptions');
assert.ok(captions?.captions.enabled && captions.captions.sourceMode === 'timeline');
const base = { fps, width: 1080, height: 1920, items: [], tracks: [] } as any;
const bound = bindTracks(solo.action!, base);
const capTrack = bound.actions.find((a: any) => a.type === 'track.create' && a.track.kind === 'caption');
assert.ok(capTrack, 'a caption track is created for the voiceover\'s words');
assert.ok(bound.actions.some((a: any) => a.type === 'setCaptions' && a.track === (capTrack as any).track.id));
const projection = resolveCaptionProjection(captions.captions, [{ ...vo.item, startFrame: 0 }] as never, fps);
assert.equal(projection.words.length, words.length);
assert.equal(projection.words.at(-1)!.text, 'trail.');
// captions: false leaves them off; a caption style id is used
assert.ok(!(build({ voiceover: 'vo', captions: false, sections: sections([3.7, 2.6, 4.2, 5.3, 4.4, 4.1]) }).action!.actions as any[]).some((a) => a.type === 'setCaptions'));

// with a song: the song dips about 12 dB wherever the voice speaks and comes back in a long pause; the voice is untouched
const withSong = build({ voiceover: 'vo', music: 'song', sections: sections([3.7, 2.6, 4.2, 5.3, 4.4, 4.1]) }, { music: true });
assert.ok(withSong.action, withSong.report.warnings.join('; '));
const songItem = (withSong.action!.actions as any[]).find((a) => a.type === 'add' && a.item.track === 'A1').item;
assert.ok(Math.abs(volumeAtFrame(songItem, Math.round(5 * fps)) - songItem.volume * NATURAL_UNDER) < 0.01, 'the song is under the voice');
assert.ok(Math.abs(volumeAtFrame(songItem, Math.round(25 * fps)) - songItem.volume) < 0.01, 'the song is back once the voice has finished');
assert.equal((withSong.action!.actions as any[]).find((a) => a.type === 'add' && a.item.track === VOICE_LANE).item.keyframes, undefined);

// a section asking for the clips' own sound over the voice is left silent, and says so
const talkOver = build({ voiceover: 'vo', music: 'song', sections: [{ move: 'cut', seconds: 4, clips: ['a'], naturalSound: 'under' }, ...sections([20])] }, { music: true });
assert.ok(talkOver.action);
assert.ok((talkOver.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.kind === 'video').every((a) => (a.item.volume ?? 0) === 0));
assert.match(talkOver.report.warnings.join(' '), /naturalSound left off: the voiceover is speaking/);

// sections in seconds start where the plan put them: the running total is snapped, so rounding never adds up
// (flooring each length on its own put "First trek" 0.4 s and "Come on" 0.5 s early in the 2026-11-02 run)
{
  const secs = [3.7, 2.6, 2.1, 1.5, 1.2, 2.5, 2.2, 2.6, 2.0, 1.5, 2.4, 2.7];
  const timed = build({ voiceover: 'vo', sections: secs.map((seconds, i) => ({ move: 'hold', seconds, clips: [['a', 'b', 'c', 'd', 'e', 'f'][i % 6]!] })) });
  assert.ok(timed.action, timed.report.warnings.join('; '));
  const starts = (timed.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.track === 'V2').map((a) => a.startFrame / fps);
  let meant = 0;
  secs.forEach((s, k) => { assert.ok(Math.abs(starts[k]! - meant) <= 0.07, `section ${k} starts at ${starts[k]} s, meant ${meant.toFixed(2)} s`); meant += s; });
  assert.ok(Math.abs(timed.report.totalFrames / fps - meant) <= 0.07);
}

// voiceoverStart skips a false start; the reel only needs the rest of it
const late = build({ voiceover: 'vo', voiceoverStart: 3.7, sections: sections([10, 10.2]) });
assert.ok(late.action, late.report.warnings.join('; '));
const lateVo = (late.action!.actions as any[]).find((a) => a.type === 'add' && a.item.track === VOICE_LANE).item;
assert.equal(lateVo.srcInFrame, Math.round(3.7 * fps));
assert.equal(lateVo.durationInFrames, Math.round(20.1 * fps));

// without a transcript the whole narration counts as speech (the song stays under it), and no captions are made
const unheard = build({ voiceover: 'vo', music: 'song', sections: sections([24]) }, { music: true, voice: { ...voice, transcript: undefined } });
assert.ok(unheard.action);
assert.ok(!(unheard.action!.actions as any[]).some((a) => a.type === 'setCaptions'));
assert.deepEqual(speechWindows({ ...voice, transcript: undefined }, 0, fps, 900), [{ from: 0, to: Math.round(23.8 * fps), solo: false }]);
// short pauses between words keep the song down (one window per breathless stretch)
assert.equal(speechWindows(voice, 0, fps, 900).length, 1);

// the agent cuts to these lines: one per sentence, seconds of the file
const lines = voiceLines(words);
assert.equal(lines.length, 6);
assert.match(lines[0]!, /^0\.0-3\.\d Did you know Pune/);
assert.match(lines[5]!, /^20\.2-23\.\d Come on our next trek.*trail\.$/);

// speech share tells a narration from a song: syllable-rate bursts read as speech, a steady bed does not
const rate = 8000;
const tone = (sec: number, on: (t: number) => boolean) => Int16Array.from({ length: sec * rate }, (_, i) => (on(i / rate) ? Math.round(Math.sin(i * 0.3) * 12000) : Math.round(Math.sin(i * 0.3) * 20)));
assert.ok(speechShareOfPcm(tone(10, (t) => (t * 4) % 1 < 0.55))! >= 0.6, 'syllable bursts are speech');
assert.ok(speechShareOfPcm(tone(10, () => true))! < 0.6, 'a steady bed is not');
assert.equal(speechShareOfPcm(new Int16Array(0)), null);

// stage 1: a mostly-speech file is listed under voiceovers with its lines (transcribed once, saved on the asset), not as
// a song; a song stays a song; a file that cannot be transcribed says so instead of disappearing
{
  const { directorOptions } = await import('../agent/directorTools');
  const assets: any[] = [
    { id: 'clip1', name: 'IMG_1.MOV', kind: 'video', src: '/c1', durationInFrames: 300, width: 1080, height: 1920 },
    { id: 'vo', name: 'Mawal 3.m4a', kind: 'audio', src: '/vo.m4a', durationInFrames: 714 },
    { id: 'song', name: 'Song.mp3', kind: 'audio', src: '/song.mp3', durationInFrames: 900 },
    { id: 'vo2', name: 'Take 2.m4a', kind: 'audio', src: '/vo2.m4a', durationInFrames: 600 },
  ];
  const saved: Record<string, unknown> = {};
  const fpsSet: number[] = [];
  const ctx: any = {
    getState: () => ({ fps: 30, items: [] }), getDoc: () => ({ assets, timelines: [] }), audio: [],
    commands: { setAssetTranscription: (id: string, patch: any) => { saved[id] = patch; }, setProjectFps: (f: number) => { fpsSet.push(f); } },
  };
  const transcribed: string[] = [];
  const api: any = {
    musicGrid: async () => null, clipFeatures: async () => null, mediaFps: async (srcs: string[]) => srcs.map(() => 60),
    speechShare: async (a: any) => ({ vo: 0.87, song: 0.25, vo2: 0.8 } as Record<string, number>)[a.id] ?? null,
    transcribe: async (a: any) => { transcribed.push(a.id); if (a.id === 'vo2') throw new Error('no speech model installed'); return words; },
  };
  const out: any = await directorOptions({}, ctx, { api } as any);
  assert.deepEqual(out.songs.map((x: any) => x.assetId), ['song']);
  assert.deepEqual(out.voiceovers.map((x: any) => x.assetId), ['vo', 'vo2']);
  assert.equal(out.voiceovers[0].lines.length, 6);
  assert.match(out.voiceovers[1].transcriptError, /no speech model/);
  assert.match(out.voiceoverHint, /never music/);
  assert.deepEqual(transcribed.sort(), ['vo', 'vo2']);
  // RS-1258: stage 1 changes nothing in the draft (a draft change there turned runs stale while the clips were watched):
  // the words wait for the build, and the 60 fps timeline is decided, not set
  assert.deepEqual(saved, {}, 'stage 1 saves no transcript');
  assert.deepEqual(fpsSet, [], 'stage 1 does not switch the timeline rate');
  assert.match(out.frameRate, /built at 60 fps/);
  const { directorSession } = await import('./directorSession');
  assert.equal(directorSession('current')?.timelineFps, 60, 'the build switches to it');
  assert.equal(directorSession('current')?.fps, 60, 'the clips were analysed at it');
  // the build saves the words heard in stage 1 on the asset, without transcribing again
  const { narrationWords } = await import('../agent/directorVoiceover');
  const heard = await narrationWords(assets[1], ctx, { api } as any);
  assert.equal(heard.words?.length, words.length);
  assert.equal((saved.vo as any).transcript.length, words.length, 'the build keeps the transcript on the asset');
  assert.deepEqual(transcribed.sort(), ['vo', 'vo2'], 'not transcribed twice');
  assert.ok(JSON.stringify(out).length < 16_000);
}

// the build's notes are about a reel with a voiceover, not a song: no "commercial track" advice about the user's own
// voice, no hint to unmute a talking clip over it, no "move with the music" when there is none
{
  const { songOnTimeline, songReportLine } = await import('../exportMusic');
  const { reviewDirectorPlan } = await import('./review');
  const items: any[] = [{ id: 'rs-dir-x-voiceover', kind: 'audio', name: 'Mawal 3.m4a', src: '/media/uploads/vo.m4a', startFrame: 0, durationInFrames: 714, props: { rsVoiceover: true } }];
  assert.equal(songOnTimeline({ items, fps }), undefined);
  assert.equal(songReportLine({ items, fps }), '');
  const plan = (parsePlan({ voiceover: 'vo', sections: sections([3.7, 2.6, 4.2, 5.3, 4.4, 4.1]) }) as any).plan as ReelPlan;
  const spans = [0, 3.7, 6.3, 10.5, 15.8, 20.2].map((from, k, a) => ({ from, to: a[k + 1] ?? 24.3 }));
  const found = reviewDirectorPlan({ plan, spans, voices: [{ section: 0, at: 0, seconds: 3.6 }] } as any).map((f) => f.issue).join(' | ');
  assert.doesNotMatch(found, /talks through|moves with the music/);
}

console.log('voiceover.verify: ok');
