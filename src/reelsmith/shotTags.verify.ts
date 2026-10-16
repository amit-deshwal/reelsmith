import assert from 'node:assert/strict';
import { SHOT_TAGS, SHOT_TAG_INFO, tagClips, tagSample, type ShotTag, type TagPrompts } from './shotTags';
import { applyCastingBias, castSlots, planToOrder } from './assembler/casting';
import type { AssemblyClip } from './assembler/types';

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

// casting
const clip = (id: string, top: ShotTag | null, score: number, extra: Partial<AssemblyClip> = {}): AssemblyClip => ({
  assetId: id, name: id, src: `/${id}`, kind: 'video', durationInFrames: 300, score,
  ...(top ? { shot: { top, confidence: 0.8, scores: Object.fromEntries(SHOT_TAGS.map((t) => [t, t === top ? 0.8 : 0.025])) as Record<ShotTag, number> } } : {}),
  ...extra,
});
const clips = [
  clip('s1', 'scenery', 0.9), clip('s2', 'scenery', 0.85), clip('s3', 'scenery', 0.8),
  clip('g1', 'people', 0.5), clip('f1', 'food', 0.6), clip('d1', 'detail', 0.55),
];
assert.equal(castSlots(clips.map((c) => ({ ...c, shot: undefined })), 4, {}, { openerSlot: 0, closerSlot: 3, chronological: false }), null, 'no tags: no plan');

const plan = castSlots(clips, 4, { opener: ['scenery'], closer: ['people'] }, { openerSlot: 0, closerSlot: 3, chronological: false })!;
const order = planToOrder(plan);
assert.equal(order.length, 4);
assert.equal(order[0]!.shot!.top, 'scenery', 'opens on scenery');
assert.equal(order[3]!.assetId, 'g1', 'closes on the group shot even though it scores lower');
assert.equal(new Set(order.map((c) => c.assetId)).size, 4, 'no repeats');
assert.ok(new Set(order.map((c) => c.shot!.top)).size >= 3, 'varied: not four sceneries although they score highest');
assert.ok(order.every((c, i) => i === 0 || c.shot!.top !== order[i - 1]!.shot!.top), 'neighbours differ');

// short footage: the closer moves up to the last filled slot
const few = castSlots(clips.slice(0, 4), 8, { closer: ['people'] }, { openerSlot: 0, closerSlot: 7, chronological: false })!;
assert.equal(planToOrder(few).length, 4);
assert.equal(planToOrder(few)[3]!.assetId, 'g1');

// a closer nobody fits is not forced
const none = castSlots(clips.slice(0, 3), 3, { closer: ['night'] }, { openerSlot: 0, closerSlot: 2, chronological: false })!;
assert.equal(none.designated.size, 0);

// near-duplicates: one clip per group
const dup = castSlots([clip('x', 'scenery', 0.9, { groupId: 'g' }), clip('y', 'scenery', 0.8, { groupId: 'g' }), clip('z', 'food', 0.4)], 3, {}, { openerSlot: 0, closerSlot: 2, chronological: false })!;
assert.equal(planToOrder(dup).length, 2);

// chronological recipes keep capture order, tags only choose which clips
const chrono = castSlots([
  clip('c3', 'food', 0.5, { captureTimeMs: 3 }), clip('c1', 'scenery', 0.9, { captureTimeMs: 1 }), clip('c2', 'people', 0.7, { captureTimeMs: 2 }),
], 3, { opener: ['people'] }, { openerSlot: 0, closerSlot: 2, chronological: true })!;
assert.deepEqual(planToOrder(chrono).map((c) => c.assetId), ['c1', 'c2', 'c3']);

// character tags exist, and bias lifts people doing things over scenery (and leaves untagged clips alone)
for (const t of ['laughing', 'shouting', 'falling', 'dancing', 'celebrating', 'posing'] as const) assert.ok(SHOT_TAGS.includes(t) && SHOT_TAG_INFO[t].prompts.length >= 2, t);
const biasRules = { boost: ['laughing', 'falling'], avoid: ['scenery'] };
const biased = applyCastingBias([clip('v', 'scenery', 0.9), clip('l', 'laughing', 0.5), clip('u', null, 0.4)], biasRules);
const byId = new Map(biased.map((c) => [c.assetId, c.score]));
assert.ok(byId.get('l')! > byId.get('v')!, 'a laughing clip now outranks a prettier scenery clip');
assert.equal(byId.get('u'), 0.4, 'untagged clips keep their score');
assert.equal(applyCastingBias([clip('v', 'scenery', 0.9)], {})[0]!.score, 0.9, 'no rules: unchanged');

console.log('shotTags verify ok');
