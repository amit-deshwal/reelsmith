// Speech cleanup: exactly the fillers, stutters and the abandoned take go at each level, words that carry meaning stay,
// and the clip is cut for real (pieces back to back, gap closed, one undo step) with captions following the cuts.
import assert from 'node:assert/strict';
import { emptyProjectDoc } from '../app/appShell';
import { historyReduce, type History } from '../editor/reduce';
import { activeTimeline } from '../editor/types';
import type { TranscriptWord } from '../transcript/types';
import { cleanupIndices, cutActions, sourceWindow, speechCuts } from './speechCleanup';

// "So um we went to we went to the the fort, and uh the view was, like, amazing. You know, I like it. I like you."
// 300 ms a word, 100 ms between words, a 1 s pause before "You"
let t = 500;
const words: TranscriptWord[] = 'So um we went to we went to the the fort, and uh the view was, like, amazing. You know, I like it. I like you.'
  .split(' ').map((text) => {
    if (text === 'You') t += 900;
    const w = { text, start: t, end: t + 300 };
    t += 400;
    return w;
  });
const said = (idxs: number[]) => idxs.map((i) => words[i]!.text).join(' ');
const left = (idxs: number[]) => words.filter((_, i) => !idxs.includes(i)).map((w) => w.text).join(' ');

assert.deepEqual(cleanupIndices(words, 'off').idxs, []);
const light = cleanupIndices(words, 'light');
assert.equal(said(light.idxs), 'um uh', 'light: only um and uh');
const balanced = cleanupIndices(words, 'balanced');
assert.equal(said(balanced.stutters), 'the');
assert.equal(said(balanced.retakes), 'we went to', 'the abandoned take');
assert.equal(left(balanced.idxs), 'So we went to the fort, and the view was, like, amazing. You know, I like it. I like you.');
const tight = cleanupIndices(words, 'tight');
assert.equal(left(tight.idxs), 'So we went to the fort, and the view was, amazing. I like it. I like you.', 'tight: "like," and "you know," go; "I like it" stays');
// meant repeats and two sentences that start alike are not retakes
const meant = (s: string) => s.split(' ').map((text, i) => ({ text, start: i * 400, end: i * 400 + 300 }));
assert.deepEqual(cleanupIndices(meant('no no I said very very good'), 'tight').idxs, []);
assert.deepEqual(cleanupIndices(meant("let's go let's go"), 'tight').idxs, [], 'a chant is not a retake');
const cut = meant('we wen- we went home');
assert.deepEqual(cleanupIndices(cut, 'balanced').idxs, [0, 1], 'a cut-off word and the take it belongs to');

// cutting: a 12 s clip of this speech; the pieces skip what was removed and keep the head and tail
const fps = 30;
const clip = { id: 'talk', track: 'V1', kind: 'video' as const, name: 'talk', src: '/media/uploads/talk.mp4', durationInFrames: 360, srcInFrame: 0, volume: 1, transcript: words, effects: [{ id: 'g', assetId: 'builtin:fx-glow' }] };
const cuts = speechCuts(words, new Set(balanced.idxs), fps, sourceWindow(clip));
assert.equal(cuts[0]!.srcInFrame, 0, 'the head before the first word stays');
assert.equal(cuts.at(-1)!.srcInFrame + cuts.at(-1)!.srcFrames, 360, 'the tail stays');
const covered = (w: TranscriptWord) => cuts.some((c) => c.srcInFrame <= Math.round((w.start / 1000) * fps) && Math.round((w.end / 1000) * fps) <= c.srcInFrame + c.srcFrames);
words.forEach((w, i) => assert.equal(covered(w), !balanced.idxs.includes(i), `"${w.text}" (${i}) ${balanced.idxs.includes(i) ? 'is cut' : 'is kept'}`));
// with pauses capped too, the long pause before "You" shrinks
const tightCuts = speechCuts(words, new Set(tight.idxs), fps, sourceWindow(clip), 350);
const total = (cs: typeof cuts) => cs.reduce((s, c) => s + c.srcFrames, 0);
assert.ok(total(tightCuts) < total(cuts) - 30, `shorter (${total(tightCuts)} vs ${total(cuts)} frames)`);

// in the editor: one undo step, the clip after moves up by what was cut, captions follow the pieces
let h: History = { past: [], present: emptyProjectDoc(), future: [] };
h = historyReduce(h, { type: 'add', startFrame: 30, item: clip } as never);
h = historyReduce(h, { type: 'add', startFrame: 390, item: { ...clip, id: 'next', name: 'next', transcript: undefined } } as never);
let n = 0;
const plan = cutActions(activeTimeline(h.present).items.find((i) => i.id === 'talk')!, cuts, () => `piece-${++n}`);
const steps = h.past.length;
h = historyReduce(h, { type: 'batch', label: 'Clean up speech', actions: plan.actions });
assert.equal(h.past.length, steps + 1);
const tl = activeTimeline(h.present);
const pieces = tl.items.filter((i) => i.name === 'talk').sort((a, b) => a.startFrame - b.startFrame);
assert.equal(pieces.length, cuts.length);
assert.equal(pieces[0]!.id, 'talk', 'the first piece keeps the clip id');
pieces.forEach((p, k) => {
  assert.equal(p.srcInFrame, cuts[k]!.srcInFrame);
  assert.equal(p.startFrame, k === 0 ? 30 : pieces[k - 1]!.startFrame + pieces[k - 1]!.durationInFrames, 'back to back');
  assert.equal(p.effects?.[0]?.assetId, 'builtin:fx-glow', 'same look');
  assert.equal(p.transcript?.length, words.length, 'the transcript rides along for the captions');
});
const end = pieces.at(-1)!.startFrame + pieces.at(-1)!.durationInFrames;
assert.equal(end, 30 + plan.frames);
assert.equal(tl.items.find((i) => i.id === 'next')!.startFrame, end, 'the gap is closed');
h = historyReduce(h, { type: 'undo' } as never);
assert.equal(activeTimeline(h.present).items.find((i) => i.id === 'talk')!.durationInFrames, 360);
assert.equal(activeTimeline(h.present).items.find((i) => i.id === 'next')!.startFrame, 390);
console.log('speechCleanup.verify: ok');
