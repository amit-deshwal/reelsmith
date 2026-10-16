import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CURRENT_PROJECT_VERSION } from '../../../shared/project-version';
import { parseRecipe } from '../../../shared/reelsmith/recipe';
import { historyReduce } from '../../editor/reduce';
import type { ProjectDoc } from '../../editor/types';
import { REVEAL_FRAG, revealRects, revealUniforms } from '../travelDiaryReveal';
import { assemble, type AssemblyClip, type AssemblyMusic } from './index';
import { DIARY_SLOTS, pickMoment, REVEAL_LEAD, splitPhrases } from './travelDiary';

const r = parseRecipe(readFileSync('recipes/travel-diary.recipe.json', 'utf8'));
assert.ok(r.ok, r.ok ? '' : r.errors.join('; '));
const recipe = r.recipe;
const fps = 30;
// 152 bpm like the reference soundtrack, first beat at 0.07 s, 13.1 s long
const P = 60 / 152.38;
const music: AssemblyMusic = {
  assetId: 'song', name: 'song', src: '/song.m4a', durationSec: 13.1,
  beatTimesSec: Array.from({ length: 34 }, (_, i) => 0.07 + i * P), beatsPerBar: 4, downbeatIndex: 0,
};
const clip = (id: string, sec: number, score: number): AssemblyClip => ({ assetId: id, name: id, src: `/${id}.mp4`, kind: 'video', durationInFrames: Math.round(sec * fps), score });
const four = [clip('a', 12.3, 0.9), clip('b', 33.6, 0.8), clip('c', 20.9, 0.7), clip('d', 24.3, 0.6)];
const params = { clipAudio: false, musicStart: 'fromStart' };
const line = 'AMK..toughest trek / in maharashtra / 2 days / trek / 6000 calories burnt';
const res = assemble({ recipe, clips: four, music, texts: { line }, params, seed: 1 });
assert.ok(res.action, res.report.warnings.join('; '));
const acts = res.action!.actions as any[];
const slots = acts.filter((a) => a.type === 'add' && a.item.track === 'V1');
assert.equal(slots.length, 12);
// back to back from 0 to the end of the reel
assert.equal(slots[0].startFrame, 0);
for (let i = 1; i < 12; i += 1) assert.equal(slots[i].startFrame, slots[i - 1].startFrame + slots[i - 1].item.durationInFrames, `slot ${i} follows slot ${i - 1}`);
const end = slots[11].startFrame + slots[11].item.durationInFrames;
assert.equal(end, res.report.totalFrames);
assert.ok(Math.abs(end / fps - (0.07 + 32 * P)) < 1.5 / fps, `8 bars long (${end / fps}s)`);
// never the same clip twice in a row; all four used
for (let i = 1; i < 12; i += 1) assert.notEqual(slots[i].item.sourceAssetId, slots[i - 1].item.sourceAssetId, `slots ${i - 1}/${i} differ`);
assert.equal(new Set(slots.map((s) => s.item.sourceAssetId)).size, 4);
// reused clips play different moments, at least 0.5 s apart (visible spans, including the part inside the bars)
const tr = acts.filter((a) => a.type === 'addTransition');
const lead = (i: number) => { const t = tr.find((x) => x.incomingItemId === slots[i].item.id); return t ? Math.floor(t.durationInFrames / 2) : 0; };
const tail = (i: number) => { const t = tr.find((x) => x.incomingItemId === slots[i + 1]?.item.id); return t ? t.durationInFrames - Math.floor(t.durationInFrames / 2) : 0; };
const spans = slots.map((s, i) => [s.item.sourceAssetId, s.item.srcInFrame - lead(i), s.item.srcInFrame + s.item.durationInFrames + tail(i)] as const);
for (const [id, a0, a1] of spans) {
  assert.ok(a0 >= 0 && a1 <= four.find((c) => c.assetId === id)!.durationInFrames, `${id} inside the clip`);
  for (const [id2, b0, b1] of spans) if (id === id2 && a0 !== b0) assert.ok(a1 + 15 <= b0 || b1 + 15 <= a0, `${id} moments apart`);
}
// four reveals into shots 2-5, each ending exactly on its cut
assert.equal(tr.length, 4);
assert.ok(tr.every((t) => t.transType === 'custom-shader' && t.custom.frag === REVEAL_FRAG));
assert.deepEqual(tr.map((t) => t.custom.uniforms.u_mode), [0, 1, 0, 2]);
tr.forEach((t, n) => {
  const inc = slots[4 + n];
  const cut = inc.startFrame + t.durationInFrames - Math.floor(t.durationInFrames / 2);
  const beatsBefore = (0.07 + DIARY_SLOTS[4 + n]!.from * P) * fps;
  assert.ok(Math.abs(cut - beatsBefore) <= 1, `reveal ${n} ends on the cut`);
  assert.ok(Math.abs(t.durationInFrames / fps - REVEAL_LEAD * P) < 1.5 / fps);
  const u = t.custom.uniforms;
  const lands = [u.u_l0, u.u_l1, u.u_l2, u.u_l3, u.u_l4].filter((x: number) => x <= 1);
  assert.equal(lands.length, n === 3 ? 4 : 5);
  assert.ok(lands.every((x: number, k: number) => k === 0 || x > lands[k - 1]), 'bars land in order');
});
// words: one at a time, each on the V2 track, in order, never overlapping
const words = acts.filter((a) => a.type === 'add' && a.item.kind === 'text');
assert.deepEqual(words.map((w) => w.item.props.text), ['AMK..TOUGHEST', 'TREK', 'IN', 'MAHARASHTRA', '2', 'DAYS', 'TREK', '6000', 'CALORIES', 'BURNT']);
for (let i = 1; i < words.length; i += 1) assert.ok(words[i].startFrame >= words[i - 1].startFrame + words[i - 1].item.durationInFrames);
assert.ok(words.every((w) => w.item.props.fontFamily === 'Libre Baskerville'));
// MAHARASHTRA measured 996 px at 110 px in the editor's 888 px text box: it must come out narrower than that box
const maha = words.find((w) => w.item.props.text === 'MAHARASHTRA').item.props.fontSize;
assert.ok(maha * (996 / 110) <= 888, `long word fits the text box (${maha}px)`);
// the music runs the length of the reel from the song start
const song = acts.find((a) => a.item?.kind === 'audio');
assert.equal(song.item.durationInFrames, end);
assert.equal(song.item.srcInFrame, 0);

// the editor accepts it in one undo step and keeps all four reveals
const doc: ProjectDoc = {
  version: CURRENT_PROJECT_VERSION, assets: [], mediaFolders: [], activeTimelineId: 't',
  timelines: [{ id: 't', name: 'T', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null, selectedIds: [], items: [] } as any],
};
const h = historyReduce({ past: [], present: doc, future: [] }, res.action!);
assert.equal(h.past.length, 1);
const tl = h.present.timelines[0]! as any;
assert.equal((tl.transitions ?? []).length, 4, 'reveals kept by the reducer');
assert.ok(tl.transitions.every((t: any) => t.customFrag === REVEAL_FRAG && t.durationInFrames === tr.find((x) => x.id === t.id).durationInFrames));
assert.equal(JSON.stringify(res), JSON.stringify(assemble({ recipe, clips: four, music, texts: { line }, params, seed: 1 })), 'deterministic');

// the agent's picks set the order clips are cast in: its first pick opens the shots
const picked = assemble({ recipe, clips: four, music, texts: {}, params, seed: 1, preferredAssetIds: ['d', 'c'] });
const pickedSlots = (picked.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.track === 'V1');
assert.deepEqual(pickedSlots.slice(0, 2).map((s) => s.item.sourceAssetId), ['d', 'c']);

// the playback preview's rectangles follow the same landing times as the shader
const uTall = revealUniforms('tall', [0.1, 0.3, 0.5, 0.7, 0.9], 1.08);
assert.deepEqual(revealRects(uTall, 0.05), [], 'nothing before the first bar lands');
assert.equal(revealRects(uTall, 0.5)!.length, 3);
assert.ok(revealRects(uTall, 0.1)![0]!.flash > 0.7 && revealRects(uTall, 0.5)![0]!.flash === 0, 'a bar flashes as it lands, then not');
assert.equal(revealRects(uTall, 1), null, 'full frame at the cut');
const bars = revealRects(uTall, 0.95)!;
assert.ok(bars.every((r, i) => i === 0 || r.x > bars[i - 1]!.x + bars[i - 1]!.w), 'tall bars side by side, no overlap');
const uWin = revealUniforms('window', [0.2, 0.4, 0.6, 0.8], 1.08);
const w1 = revealRects(uWin, 0.3)![0]!, w4 = revealRects(uWin, 0.9)![0]!;
assert.ok(w4.w > w1.w && w1.flash === 0, 'the window grows in steps, no flash');

// phrase splitting
assert.deepEqual(splitPhrases('a / b c / d').phrases, [['a'], ['b', 'c'], ['d'], [], []]);
assert.deepEqual(splitPhrases('one two three').phrases, [['one'], ['two'], ['three'], [], []]);
const auto = splitPhrases('six days in the alps with the best people one old van no signal and the coldest lake');
assert.equal(auto.phrases.flat().length, 18);
assert.ok(auto.phrases.every((p, i) => p.length <= [6, 6, 3, 3, 5][i]!));
assert.deepEqual(splitPhrases(Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')).dropped.length, 7);
// too long a phrase is cut to its stretch
assert.deepEqual(splitPhrases('a b c d / e / f g h i').dropped, ['i']);

// moments: away from earlier uses, inside the clip, null when it cannot fit
assert.equal(pickMoment(clip('x', 1, 1), 60, [], 15), null);
const m = pickMoment(clip('x', 10, 1), 60, [[0, 120]], 15)!;
assert.ok(m >= 135 && m + 60 <= 300);

// too few clips or no song: a clear message, no edit
assert.equal(assemble({ recipe, clips: four.slice(0, 2), music, texts: {}, params, seed: 1 }).action, null);
assert.equal(assemble({ recipe, clips: four, texts: {}, params, seed: 1 }).action, null);
// a short song is reported
const short = assemble({ recipe, clips: four, music: { ...music, durationSec: 8 }, texts: {}, params, seed: 1 });
assert.ok(short.report.warnings.some((w) => /song ends/.test(w)));
console.log('travelDiary.verify: ok');

// RS-109: tagged clips are cast by what they show (opener on shot 1, closer on the last slot, no agent picks)
{
  const tagged = (id: string, sec: number, score: number, top: string): AssemblyClip => ({
    ...clip(id, sec, score),
    shot: { top: top as never, confidence: 0.8, scores: { scenery: 0, people: 0, portrait: 0, action: 0, food: 0, detail: 0, city: 0, water: 0, night: 0, [top]: 0.8 } as never },
  });
  const pool = [tagged('v1', 30, 0.95, 'scenery'), tagged('v2', 30, 0.9, 'scenery'), tagged('v3', 30, 0.5, 'people'), tagged('v4', 30, 0.6, 'action')];
  const cast = assemble({ recipe: { ...recipe, casting: { opener: ['scenery'], closer: ['people'] } }, clips: pool, music, texts: { line }, params, seed: 1 });
  assert.ok(cast.action, cast.report.warnings.join('; '));
  const placed = (cast.action!.actions as any[]).filter((a) => a.type === 'add' && a.item.track === 'V1');
  assert.equal(placed[11].item.sourceAssetId, 'v3', 'closes on the group shot although it scores lower');
  assert.ok(cast.report.warnings.some((w) => w.startsWith('Shots chosen by what they show')));
  for (let i = 1; i < 12; i += 1) assert.notEqual(placed[i].item.sourceAssetId, placed[i - 1].item.sourceAssetId);
  // untagged clips: same behaviour as before, no casting note
  const plain = assemble({ recipe, clips: four, music, texts: { line }, params, seed: 1 });
  assert.ok(!plain.report.warnings.some((w) => w.includes('by what they show')));
}
console.log('travelDiary casting: ok');
