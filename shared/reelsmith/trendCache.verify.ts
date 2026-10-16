import assert from 'node:assert/strict';
import { formatNotesDate, isStale, loadTrendNotes, parseTrendResults, saveTrendNotes, TREND_CACHE_KEY, type KeyValueStore } from './trendCache';

const mem = (): KeyValueStore & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };
const good = { version: 1, target: { recipeId: 'mini-vlog', ratio: '9:16' }, clips: [{ count: 5, shotType: 'any' }], whyTrending: 'x', sources: [{ title: 't', url: 'https://example.com', publishedAt: '2026-10-10' }] };

const parsed = parseTrendResults(JSON.stringify([good, { version: 2 }]));
assert.equal(parsed.briefs.length, 1);
assert.ok(parsed.errors.some((e) => /^brief 2:/.test(e)));
assert.equal(parseTrendResults('{nope').briefs.length, 0);
assert.equal(parseTrendResults(JSON.stringify(good)).briefs.length, 1, 'single brief accepted');

const store = mem();
assert.equal(loadTrendNotes(store), null, 'empty cache');
assert.equal(saveTrendNotes(store, 'goa', []), null, 'nothing to save');
const day0 = new Date('2026-10-01T10:00:00Z');
saveTrendNotes(store, 'goa trip', parsed.briefs, day0);
// reopen "offline": a fresh load only reads the store
const loaded = loadTrendNotes(store)!;
assert.equal(loaded.briefs.length, 1);
assert.equal(loaded.topic, 'goa trip');
assert.equal(formatNotesDate(loaded), '2026-10-01');
assert.equal(isStale(loaded, new Date('2026-10-15T10:00:00Z')), false, 'exactly 14 days is fresh');
assert.equal(isStale(loaded, new Date('2026-10-15T10:00:01Z')), true, 'older than 14 days is stale');
assert.equal(isStale({ savedAt: 'garbage' }), true);

store.m.set(TREND_CACHE_KEY, '{broken');
assert.equal(loadTrendNotes(store), null, 'corrupt cache ignored');
store.m.set(TREND_CACHE_KEY, JSON.stringify({ version: 1, savedAt: day0.toISOString(), topic: '', briefs: [good, { bad: 1 }] }));
assert.equal(loadTrendNotes(store)!.briefs.length, 1, 'tampered briefs dropped on read');
const throwing: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
assert.equal(loadTrendNotes(throwing), null);
assert.equal(saveTrendNotes(throwing, 't', parsed.briefs), null);
console.log('trendCache verify ok');
