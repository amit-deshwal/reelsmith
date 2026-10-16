import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe, type Recipe } from '../../shared/reelsmith/recipe';
import { assemble, type AssemblyClip, type AssemblyMusic } from './assembler';
import { MUSIC_PARAM, musicDefaults, withMusicOverrides } from './musicPolicy';
import { defaultValues, validateSetup } from './setupForm';

const load = (name: string): Recipe => {
  const r = parseRecipe(readFileSync(`recipes/${name}.recipe.json`, 'utf8'));
  assert.ok(r.ok);
  return r.recipe;
};
const fps = 30;
// 120 bpm, first beat at 0.25 s, bars start on beat 1 (0.75 s, 2.75 s, ...), so the song's bars are not the reel's beat 0
const music: AssemblyMusic = {
  assetId: 'song', name: 's', src: '/s.mp3', durationSec: 90,
  beatTimesSec: Array.from({ length: 180 }, (_, i) => 0.25 + i * 0.5), beatsPerBar: 4, downbeatIndex: 1,
};
const onBar = (sec: number) => Math.abs(((sec - 0.75) % 2 + 2) % 2) < 1 / fps || Math.abs(((sec - 0.75) % 2 + 2) % 2 - 2) < 1 / fps;
const clips: AssemblyClip[] = Array.from({ length: 80 }, (_, i) => ({
  assetId: `c${i}`, name: `c${i}`, src: `/c${i}`, kind: 'video', durationInFrames: 300, score: ((i * 7) % 13) / 13,
}));
const montage = load('travel-beat-montage');
const run = (params: Record<string, string | number | boolean>, recipe = montage) =>
  assemble({ recipe, clips, music, texts: { title: 'x' }, params: { ...defaultValues(recipe).params, ...params }, seed: 1 });
const songOf = (res: ReturnType<typeof run>) => res.action!.actions.find((a: any) => a.item?.kind === 'audio') as any;

// form defaults come from the recipe; overrides replace them; garbage is ignored
assert.equal(musicDefaults(montage)[MUSIC_PARAM.start], 'firstDownbeat');
assert.equal(musicDefaults(montage)[MUSIC_PARAM.end], 'endOnBar');
assert.equal(musicDefaults(montage)[MUSIC_PARAM.fadeOutSec], montage.music!.fadeOutSec);
const o = withMusicOverrides(montage, { [MUSIC_PARAM.start]: 'loudestSection', [MUSIC_PARAM.end]: 'nope', [MUSIC_PARAM.fadeOutSec]: 99 });
assert.equal(o.music!.startPolicy, 'loudestSection');
assert.equal(o.music!.endPolicy, montage.music!.endPolicy, 'unknown end policy keeps the recipe one');
assert.equal(o.music!.fadeOutSec, 10, 'fade clamped');

// end on a bar: the reel stops on one of the song's bars even when it starts from the very beginning
const fromStart = run({ [MUSIC_PARAM.start]: 'fromStart', [MUSIC_PARAM.end]: 'endOnBar' });
assert.ok(fromStart.action);
assert.equal(fromStart.report.musicStartSec, 0);
const endSec = fromStart.report.totalFrames / fps;
assert.ok(onBar(endSec), `ends on a bar (${endSec}s)`);
assert.ok(endSec <= 20 + 1e-6 && endSec > 18, `last full bar before the 20 s target (${endSec}s)`);

// fit reel length to whole bars: nearest bar to the target (20.75 s is closer than 18.75 s)
const fit = run({ [MUSIC_PARAM.start]: 'fromStart', [MUSIC_PARAM.end]: 'hardCut', [MUSIC_PARAM.fitBars]: true });
assert.ok(Math.abs(fit.report.totalFrames / fps - 20.75) < 1 / fps, `fit to bars (${fit.report.totalFrames / fps}s)`);
assert.equal(fit.run.params[MUSIC_PARAM.fitBars], true, 'saved with the run so a re-cut keeps it');

// hard cut never fades; fade-out uses the chosen length
assert.equal(songOf(fit).item.fadeOutFrames, undefined, 'hard cut: no fade');
const faded = run({ [MUSIC_PARAM.end]: 'fadeOut', [MUSIC_PARAM.fadeOutSec]: 2 });
assert.equal(songOf(faded).item.fadeOutFrames, 2 * fps);

// a chosen start time snaps to the nearest downbeat; the music clip starts there in the song
const offset = run({ [MUSIC_PARAM.start]: 'userOffset', [MUSIC_PARAM.offsetSec]: 9 });
assert.equal(offset.report.musicStartSec, 8.75);
assert.equal(songOf(offset).item.srcInFrame, Math.round(8.75 * fps));
const firstDown = run({});
assert.equal(firstDown.report.musicStartSec, 0.75, 'recipe default: first downbeat');

// a speech-led reel: the song can start later and stop on a bar inside the reel
const story = load('captioned-story');
const words = Array.from({ length: 24 }, (_, i) => ({ text: `w${i}`, start: 500 + i * 700, end: 800 + i * 700 }));
const talk: AssemblyClip = { assetId: 't', name: 't', src: '/t.mp4', kind: 'video', durationInFrames: 900, score: 1, transcript: words };
const sp = assemble({
  recipe: story, clips: [talk], broll: [], music, texts: { hook: 'hi' }, seed: 1,
  params: { ...defaultValues(story).params, [MUSIC_PARAM.start]: 'userOffset', [MUSIC_PARAM.offsetSec]: 4, [MUSIC_PARAM.end]: 'endOnBar', [MUSIC_PARAM.fadeOutSec]: 0.5 },
});
assert.ok(sp.action);
const spSong = songOf(sp);
assert.equal(sp.report.musicStartSec, 4.75);
assert.equal(spSong.item.srcInFrame, Math.round(4.75 * fps));
assert.ok(spSong.item.durationInFrames <= sp.report.totalFrames);
assert.ok(onBar(4.75 + spSong.item.durationInFrames / fps), 'song stops on a bar');
assert.equal(spSong.item.fadeOutFrames, Math.round(0.5 * fps));

// the form refuses a negative start time and an out-of-range fade, only when they apply
const v = defaultValues(montage);
v.media = { clips: clips.slice(0, 10).map((c) => ({ assetId: c.assetId, kind: 'video' as const })), music: [{ assetId: 'song', kind: 'audio' }] };
const fieldErrors = (params: Record<string, unknown>) => validateSetup(montage, { ...v, params: { ...v.params, ...params } as never }).map((e) => e.field);
assert.ok(!fieldErrors({ [MUSIC_PARAM.offsetSec]: -1 }).includes(MUSIC_PARAM.offsetSec), 'offset ignored unless chosen');
assert.ok(fieldErrors({ [MUSIC_PARAM.start]: 'userOffset', [MUSIC_PARAM.offsetSec]: -1 }).includes(MUSIC_PARAM.offsetSec));
assert.ok(fieldErrors({ [MUSIC_PARAM.fadeOutSec]: 11 }).includes(MUSIC_PARAM.fadeOutSec));

console.log('musicPolicy.verify: ok');
