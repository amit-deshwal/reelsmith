// RS-503: editing a caption line keeps the timing of untouched words exactly,
// interpolates inserted words, follows trims/speed, and hides captions after
// more than 1.2 s of silence. npx tsx src/captions/cueEditTiming.verify.ts
import assert from 'node:assert/strict';
import type { TimelineItem } from '../editor/types';
import { buildCues, cueTextPatch } from './captionCues';
import { activeCaptionPages, buildCaptionPages } from './captionPages';
import { activePage, LINGER_MS, paginate } from './types';
import type { CaptionsData } from './types';

const fps = 30;
const timing = (words: { text: string; start: number; end: number }[]) =>
  words.map((word) => `${word.text}@${word.start}-${word.end}`);

// Four back-to-back words, 1 s each, with a 100 ms breath before "gamma".
const base: CaptionsData = {
  enabled: true,
  template: 'plain',
  pacing: 'phrase',
  words: [
    { id: 'w0', text: 'Alpha', start: 0, end: 900 },
    { id: 'w1', text: 'beta', start: 1000, end: 1900 },
    { id: 'w2', text: 'gamma', start: 2000, end: 2900 },
    { id: 'w3', text: 'delta', start: 3000, end: 3900 },
  ],
};

function editCue(captions: CaptionsData, text: string, items: TimelineItem[] = []) {
  const rows = buildCues(captions, items, fps);
  const patch = cueTextPatch(captions, rows, 0, text);
  assert.ok(patch, `cue edit to "${text}" must produce a patch`);
  const edited = { ...captions, ...patch };
  return buildCaptionPages(edited, items, fps).flatMap((identity) => identity.page.words);
}

const byText = <T extends { text: string }>(words: T[], text: string): T => {
  const found = words.find((word) => word.text === text);
  assert.ok(found, `expected a word "${text}" in ${words.map((word) => word.text).join(' ')}`);
  return found;
};

// 1. Case change of one word keeps every word's source timing.
{
  const out = editCue(base, 'Alpha BETA gamma delta');
  assert.deepEqual(timing(out), ['Alpha@0-900', 'BETA@1000-1900', 'gamma@2000-2900', 'delta@3000-3900'],
    'untouched and re-cased words keep their exact source timing');
}

// 2. Inserting a word inside a gap is interpolated between its neighbours and
// leaves the neighbours' timing exactly as it was.
{
  const out = editCue(base, 'Alpha beta and gamma delta');
  assert.equal(byText(out, 'Alpha').start, 0);
  assert.equal(byText(out, 'beta').end, 1900, 'word before the insertion keeps its end');
  assert.equal(byText(out, 'gamma').start, 2000, 'word after the insertion keeps its start');
  const and = byText(out, 'and');
  assert.ok(and.start >= 1900 && and.end <= 2000, `inserted word sits in the gap, got ${and.start}-${and.end}`);
  assert.ok(and.end > and.start, 'inserted word has a positive duration');
}

// 3. Appending a word after the last word gets a word-length span, not 1 ms.
{
  const out = editCue(base, 'Alpha beta gamma delta extra');
  const extra = byText(out, 'extra');
  assert.equal(extra.start, 3900, 'appended word starts where the last word ends');
  assert.equal(extra.end - extra.start, 900, 'appended word takes the cue average word length');
}

// 4. Deleting a word hides it and leaves the others on their own timing.
{
  const out = editCue(base, 'Alpha gamma delta');
  assert.deepEqual(timing(out), ['Alpha@0-900', 'gamma@2000-2900', 'delta@3000-3900'],
    'deleted word disappears; survivors keep exact timing');
}

// 5. Edits follow speed: a 2x clip halves every word, and an edit to one word
// keeps the projected timing of the others.
{
  const items: TimelineItem[] = [{
    id: 'clip', track: 'V1', startFrame: 0, durationInFrames: 45, kind: 'video', name: 'clip', src: '/clip.mp4',
    transcriptGenerationId: 'gen-clip', playbackRate: 2,
    transcript: [
      { id: 't0', text: 'Alpha', start: 0, end: 1000 },
      { id: 't1', text: 'beta', start: 1000, end: 2000 },
    ],
  }] as unknown as TimelineItem[];
  const sped: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip' };
  const before = buildCaptionPages(sped, items, fps).flatMap((identity) => identity.page.words);
  assert.deepEqual(timing(before), ['Alpha@0-500', 'beta@500-1000'], 'a 2x clip plays its words at double speed');
  const out = editCue(sped, `${before[0]!.text} changed`, items);
  assert.equal(out[0]!.start, before[0]!.start, 'first word keeps its projected timing after a speed edit');
  assert.equal(out[0]!.end, before[0]!.end);
  assert.ok(byText(out, 'changed').start >= before[1]!.start, 'edited word takes the projected slot');
}

// 5b. Trims: words before the clip's in-point are dropped and the rest move
// up with the trim; an edit to a surviving word keeps its projected timing.
{
  const items: TimelineItem[] = [{
    id: 'clip', track: 'V1', startFrame: 0, durationInFrames: 60, kind: 'video', name: 'clip', src: '/clip.mp4',
    transcriptGenerationId: 'gen-trim', srcInFrame: 30,
    transcript: [
      { id: 'x0', text: 'skipped', start: 0, end: 500 },
      { id: 'x1', text: 'keep', start: 1500, end: 2000 },
      { id: 'x2', text: 'this', start: 2000, end: 2500 },
    ],
  }] as unknown as TimelineItem[];
  const trimmed: CaptionsData = { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip' };
  const before = buildCaptionPages(trimmed, items, fps).flatMap((identity) => identity.page.words);
  assert.deepEqual(timing(before), ['keep@500-1000', 'this@1000-1500'], 'words before the in-point are dropped and the rest shift up');
  const out = editCue(trimmed, 'keep that', items);
  assert.equal(byText(out, 'keep').start, 500, 'surviving word keeps its projected start after an edit');
  assert.equal(byText(out, 'keep').end, 1000);
  assert.ok(!out.some((word) => word.text === 'skipped'), 'trimmed-away words stay gone');
}

// 6. Silence: a caption stays up for at most 1.2 s after its last word, even
// when the next caption is far away; it reappears when the next caption starts.
{
  assert.equal(LINGER_MS, 1200, 'captions hide after 1.2 s of silence');
  const gapped = paginate(
    [{ text: 'Hello', start: 0, end: 800 }, { text: 'there', start: 5_000, end: 5_800 }],
    'phrase',
  );
  assert.equal(gapped.length, 2, 'a 4 s silence splits the captions into two pages');
  assert.ok(activePage(gapped, 800 + 1_100), 'still shown inside the 1.2 s silence allowance');
  assert.equal(activePage(gapped, 800 + 1_300), null, 'hidden once silence passes 1.2 s');
  assert.equal(activePage(gapped, 4_999), null, 'hidden during the long silence');
  assert.ok(activePage(gapped, 5_000), 'shown when the next caption starts');
}
{
  const captions: CaptionsData = {
    enabled: true, template: 'plain', pacing: 'phrase',
    words: [{ id: 'a', text: 'Hi', start: 0, end: 500 }, { id: 'b', text: 'again', start: 6_000, end: 6_500 }],
  };
  const pages = buildCaptionPages(captions, [], fps);
  assert.equal(activeCaptionPages(pages, 500 + LINGER_MS + 100).length, 0, 'the single-stream path hides after silence too');
  assert.equal(activeCaptionPages(pages, 6_200).length, 1, 'and shows the next caption');
}

console.log('cueEditTiming.verify: RS-503 caption edit timing and silence hide OK');
