// RS-1253: a lyric reel: the sung words, or the user's lyrics on the sung timing, shown one at a time behind the person.
import assert from 'node:assert/strict';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { resolveCaptionProjection } from '../../captions/resolve';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { reelsCaptionStyle } from '../captionStyles';
import { DEVANAGARI_FONT } from '../scriptFonts';
import { bindTracks } from '../trackBinding';
import { directorRecipe } from './assembleDirector';
import { alignLyrics, reelLyrics, sungWords } from './lyrics';

const w = (text: string, start: number, end: number) => ({ text, start, end });
const heard = [w('[Music]', 0, 900), w('deewana', 1000, 1400), w('hua', 1400, 1700), w('♪', 1700, 1800), w('kaisa', 2000, 2400), w('hoga', 2400, 2800)];
assert.deepEqual(sungWords(heard).map((x) => x.text), ['deewana', 'hua', 'kaisa', 'hoga'], 'tags and notes are not lyrics');

// as many words as heard: each takes its place
assert.deepEqual(alignLyrics(heard, 'दीवाना हुआ कैसा होगा'), [w('दीवाना', 1000, 1400), w('हुआ', 1400, 1700), w('कैसा', 2000, 2400), w('होगा', 2400, 2800)]);
// fewer: several heard words make one
assert.deepEqual(alignLyrics(heard, 'दीवाना कैसा'), [w('दीवाना', 1000, 1700), w('कैसा', 2000, 2800)]);
// more: a heard word is shared out evenly, in order, without overlaps
const more = alignLyrics(heard, 'तू दीवाना हुआ रे कैसा होगा जादूगर');
assert.equal(more.length, 7);
more.forEach((x, i) => { assert.ok(x.end > x.start); if (i) assert.ok(x.start >= more[i - 1]!.end); });
assert.equal(more[0]!.start, 1000);
assert.equal(more.at(-1)!.end, 2800);
assert.deepEqual(alignLyrics([], 'हाय'), []);
assert.deepEqual(alignLyrics(heard, '   '), []);

// a song started 1.2 s in: its words move to reel time; a word counts when at least half of it is inside the reel
assert.deepEqual(reelLyrics(words4(), 1.2, 1300), [w('दीवाना', 0, 200), w('हुआ', 200, 500), w('कैसा', 800, 1200)], 'half of दीवाना is in the reel; होगा starts as it ends');
assert.deepEqual(reelLyrics(words4(), 1.3, 1300).map((x) => x.text), ['हुआ', 'कैसा'], 'less than half of दीवाना: left out');
function words4() { return alignLyrics(heard, 'दीवाना हुआ कैसा होगा'); }

// the plan
const ok = (raw: unknown) => { const p = parsePlan(raw); assert.ok(p.ok, p.ok ? '' : p.errors.join('; ')); return (p as { plan: ReelPlan }).plan; };
const base = { ratio: '16:9', music: 'song', sections: [{ move: 'hold', beats: 8, clips: ['walk'] }, { move: 'cut', beats: 8, clips: ['walk', 'steps'] }] };
assert.deepEqual(ok({ ...base, lyrics: true }).lyrics, {});
assert.deepEqual(ok({ ...base, lyrics: { text: ' दीवाना हुआ ', color: '#E8141B' } }).lyrics, { text: 'दीवाना हुआ', color: '#E8141B' });
for (const bad of [{ color: 'red' }, { language: 'hindi' }, 'yes', { text: 3 }]) assert.ok(!parsePlan({ ...base, lyrics: bad }).ok, JSON.stringify(bad));
assert.ok(!parsePlan({ ...base, music: undefined, lyrics: true }).ok, 'lyrics need a song');

// the build: one caption track holds the words at reel times, in the lyric style with the Devanagari face; the song's clip
// carries no transcript (that would make it a word-edited clip that plays only from the first sung word to the last)
const fps = 30;
const clip = (id: string, sec: number): AssemblyClip => ({ assetId: id, name: id, src: `/media/uploads/${id}.mp4`, kind: 'video', width: 1920, height: 1080, durationInFrames: sec * fps, score: 0.5 });
const clips = [clip('walk', 12), clip('steps', 10)];
const words = alignLyrics(heard, 'दीवाना हुआ कैसा होगा');
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0, lyrics: words };
const plan = ok({ ...base, lyrics: { color: '#e8141b' } });
const res = assemble({ recipe: directorRecipe(plan), clips, music, texts: {}, params: {}, seed: 2, plan });
assert.ok(res.action, res.report.warnings.join('; '));
const acts = res.action!.actions as any[];
const song = acts.find((a) => a.type === 'add' && a.item.sourceAssetId === 'song')!.item;
assert.equal(song.transcript, undefined, 'the song plays whole');
const caps = acts.filter((a) => a.type === 'setCaptions');
assert.equal(caps.length, 1);
const look = reelsCaptionStyle('lyrics-behind');
assert.deepEqual(caps[0].captions.words.map((x: any) => [x.text, x.start, x.end]), words.map((x) => [x.text, x.start, x.end]), 'reel times (the song starts at 0 here)');
assert.equal(caps[0].captions.rsBehind, true, 'behind the person');
assert.equal(caps[0].captions.styleOverride.wordsPerPage, 1, 'one word at a time');
assert.equal(caps[0].captions.styleOverride.color, '#e8141b');
assert.equal(caps[0].captions.styleOverride.highlightColor, '#e8141b', 'one word a page is always the highlighted one');
assert.equal(caps[0].captions.styleOverride.fontFamily, `${look.styleOverride.fontFamily}, ${DEVANAGARI_FONT}`);
assert.equal(caps[0].captions.styleOverride.fontWeight, 800);

// on the timeline the captions show each word exactly when it is sung
const doc: ProjectDoc = { version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't', timelines: [{ id: 't', name: 'T', order: 0, fps, width: 1920, height: 1080, selectedId: null, selectedIds: [], items: [] } as any] };
let n = 0;
const h = historyReduce({ past: [], present: doc, future: [] }, bindTracks(res.action!, doc.timelines[0] as any, () => `track_${n++}`));
const tl = h.present.timelines[0] as any;
const shown = resolveCaptionProjection(tl.captions, tl.items, fps).words;
assert.deepEqual(shown.map((x: any) => [x.text, x.start, x.end]), words.map((x) => [x.text, x.start, x.end]));
const songItem = tl.items.find((i: any) => i.sourceAssetId === 'song');
assert.ok(!songItem.transcript && songItem.srcInFrame === 0, 'the song keeps its intro');

// no words heard: a note, no captions
const silent = assemble({ recipe: directorRecipe(plan), clips, music: { ...music, lyrics: [] }, texts: {}, params: {}, seed: 2, plan });
assert.ok(!(silent.action!.actions as any[]).some((a) => a.type === 'setCaptions'));
assert.ok(silent.report.warnings.some((x) => x.startsWith('lyrics:')));
// a plan without lyrics leaves the song's words alone
const plain = assemble({ recipe: directorRecipe(ok(base)), clips, music, texts: {}, params: {}, seed: 2, plan: ok(base) });
assert.ok(!(plain.action!.actions as any[]).some((a) => a.type === 'setCaptions' || a.item?.transcript));
console.log('lyrics: sung words, given lyrics and the lyric captions ok');
