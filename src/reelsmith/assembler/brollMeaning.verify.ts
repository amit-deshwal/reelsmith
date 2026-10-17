import assert from 'node:assert/strict';
import { matchBroll, tagsForSentence } from './brollMeaning';
import { SHOT_TAGS, type ShotTag } from '../shotTags';
import type { AssemblyClip } from './types';

// sentence -> tags
assert.deepEqual(tagsForSentence('We hiked up the mountain and the view was crazy'), ['scenery', 'action', 'shouting'], 'most-mentioned first (mountain + view = 2)');
assert.ok(tagsForSentence('Phir hum sab doston ne chai pi').includes('food'), 'Hinglish words are known');
assert.ok(tagsForSentence('Phir hum sab doston ne chai pi').includes('people'));
assert.ok(tagsForSentence('हम सब समुद्र पर गए').includes('water'), 'Devanagari words are known');
assert.deepEqual(tagsForSentence('Then something happened.'), [], 'no known word -> no tags');
assert.deepEqual(tagsForSentence('BEACH!'), ['water'], 'case and punctuation do not matter');

const scores = (top: ShotTag, p = 0.8): Record<ShotTag, number> => Object.fromEntries(SHOT_TAGS.map((t) => [t, t === top ? p : 0.02])) as Record<ShotTag, number>;
const clip = (id: string, score: number, top?: ShotTag): AssemblyClip => ({
  assetId: id, name: id, src: `/${id}.mp4`, kind: 'video', durationInFrames: 300, score,
  ...(top ? { shot: { top, confidence: 0.8, scores: scores(top) } } : {}),
});

// tagged clips: each sentence gets the clip that shows what it says, even when its score is lower
const ranked = [clip('city', 0.9, 'city'), clip('water', 0.5, 'water'), clip('food', 0.4, 'food'), clip('plain', 0.3)];
let m = matchBroll(['We went to the beach', 'Then we ate lunch'], ranked);
assert.deepEqual(m.picks.map((c) => c.assetId), ['water', 'food']);
assert.equal(m.matched, 2);
assert.match(m.note, /2 of 2/);

// never repeats a clip, even if two sentences want the same tag
m = matchBroll(['the beach', 'the sea again', 'a lake'], ranked);
assert.equal(new Set(m.picks.map((c) => c.assetId)).size, m.picks.length);
assert.equal(m.picks[0]!.assetId, 'water');
assert.equal(m.matched, 1, 'only the first sentence found a water clip; the rest fall back to score order');

// no known words / no tags: exactly the plain score order, no note
m = matchBroll(['Then something happened', 'And it kept going'], ranked);
assert.deepEqual(m.picks.map((c) => c.assetId), ['city', 'water']);
assert.equal(m.matched, 0);
assert.equal(m.note, '');
const untagged = [clip('a', 0.9), clip('b', 0.8), clip('c', 0.7)];
m = matchBroll(['the beach', 'the mountain'], untagged);
assert.deepEqual(m.picks.map((c) => c.assetId), ['a', 'b'], 'clips without tags keep the score order');
assert.equal(m.matched, 0);

// a weak fit is not used
const weak = [clip('x', 0.9, 'city'), clip('w', 0.5, 'water')];
weak[1]!.shot!.scores.water = 0.1;
assert.deepEqual(matchBroll(['the beach'], weak).picks.map((c) => c.assetId), ['x']);

// fewer clips than sentences
assert.equal(matchBroll(['a', 'b', 'c'], [clip('only', 1)]).picks.length, 1);
console.log('brollMeaning.verify ok');
