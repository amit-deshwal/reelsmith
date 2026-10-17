import assert from 'node:assert/strict';
import { captureTrendReply } from './trendCapture.ts';
import { loadTrendNotes, type KeyValueStore } from './trendCache.ts';
import { trendResearchPrompt } from './trendScout.ts';
import { bundledCatalog } from '../../src/reelsmith/bundledRecipes.ts';

const mem = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};
const now = new Date('2026-10-17T12:00:00Z');
const prompt = trendResearchPrompt({ topic: 'gym fails', availableClips: 2, research: true }, bundledCatalog.recipes);
const brief = (id: string) => ({ version: 1, target: { recipeId: id, ratio: '9:16' }, clips: [{ count: 6, shotType: 'wide', minLengthSec: 1 }], text: [{ count: 1, maxWords: 6, tone: 'funny' }],
  whyTrending: 'x', sources: [{ title: 'S', url: 'https://example.com/a', publishedAt: '2026-10-10' }] });
const reply = '```json\n' + JSON.stringify([brief('beat-cut'), brief('gang-reel')]) + '\n```';

// running turn: nothing yet
let store = mem();
assert.equal(captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: reply }], true, now), null);

// finished turn: briefs saved with the topic from the prompt
let r = captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: reply }], false, now)!;
assert.equal(r.notes?.briefs.length, 2);
assert.equal(r.notes?.topic, 'gym fails');
assert.equal(loadTrendNotes(store)?.briefs.length, 2, 'readable by the Ideas panel');
assert.deepEqual(r.warnings, []);

// same reply again: captured once
assert.equal(captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: reply }], false, now), null);

// an ordinary chat that never sent the research prompt is ignored, even if it holds JSON
store = mem();
assert.equal(captureTrendReply(store, [{ role: 'user', text: 'hello' }, { role: 'assistant', text: reply }], false, now), null);
assert.equal(loadTrendNotes(store), null);

// an assistant message from before the prompt is not taken
assert.equal(captureTrendReply(mem(), [{ role: 'assistant', text: reply }, { role: 'user', text: prompt }], false, now), null);

// unreadable reply: reported once, nothing saved; paste still possible
store = mem();
const bad = captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: 'I could not find anything.' }], false, now)!;
assert.equal(bad.notes, null);
assert.ok(bad.errors.length > 0);
assert.equal(captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: 'I could not find anything.' }], false, now), null);
assert.equal(loadTrendNotes(store), null);

// stale/undated sources come back as warnings but still save
store = mem();
const old = { ...brief('beat-cut'), sources: [{ title: 'Old', url: 'https://example.com/o', publishedAt: '2026-01-01' }] };
r = captureTrendReply(store, [{ role: 'user', text: prompt }, { role: 'assistant', text: JSON.stringify([old]) }], false, now)!;
assert.equal(r.notes?.briefs.length, 1);
assert.equal(r.warnings.length, 1);

console.log('trendCapture.verify ok');
