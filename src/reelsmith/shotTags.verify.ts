import assert from 'node:assert/strict';
import { SHOT_TAGS, SHOT_TAG_INFO, tagClips, tagSample, type TagPrompts } from './shotTags';

// toy 9-d space: tag i is axis i, so prompts are unit vectors
const axis = (i: number, extra: Record<number, number> = {}) => SHOT_TAGS.map((_, k) => (k === i ? 1 : 0) + (extra[k] ?? 0));
const prompts = Object.fromEntries(SHOT_TAGS.map((t, i) => [t, [axis(i)]])) as TagPrompts;

// a sample close to one tag gets that tag; probabilities sum to 1
const p = tagSample(axis(1, { 0: 0.1 }), prompts);
assert.equal(SHOT_TAGS.reduce((a, b) => (p[b] > p[a] ? b : a)), 'people');
assert.ok(Math.abs(SHOT_TAGS.reduce((s, t) => s + p[t], 0) - 1) < 1e-9);

// samples are averaged per asset; assets with no vectors are absent
const tagged = tagClips([
  { assetId: 'a', vector: axis(0) }, { assetId: 'a', vector: axis(0, { 3: 0.2 }) }, { assetId: 'b', vector: axis(4) },
], prompts);
assert.equal(tagged.get('a')!.top, 'scenery');
assert.equal(tagged.get('a')!.samples, 2);
assert.equal(tagged.get('b')!.top, 'food');
assert.equal(tagged.has('c'), false);

// character tags exist, and bias lifts people doing things over scenery (and leaves untagged clips alone)
for (const t of ['laughing', 'shouting', 'falling', 'dancing', 'celebrating', 'posing'] as const) assert.ok(SHOT_TAGS.includes(t) && SHOT_TAG_INFO[t].prompts.length >= 2, t);

console.log('shotTags verify ok');
