import assert from 'node:assert/strict';
import { cacheable, cachedOptions, forgetOptions, OPTIONS_CACHE_MS, optionsKey, pickStage1, rememberOptions } from './directorOptionsCache';

const media = [{ id: 'b', src: '/b.mp4', durationInFrames: 90 }, { id: 'a', src: '/a.mp4', durationInFrames: 60 }];
const k1 = optionsKey({ fps: 30, media, args: { find: ['the pool'], songFrom: 1 } });
// order of media and of argument keys does not matter
assert.equal(k1, optionsKey({ fps: 30, media: [...media].reverse(), args: { songFrom: 1, find: ['the pool'] } }));
// a new import, another rate or other arguments do
assert.notEqual(k1, optionsKey({ fps: 30, media: [...media, { id: 'c', src: '/c.mp4', durationInFrames: 30 }], args: { find: ['the pool'], songFrom: 1 } }));
assert.notEqual(k1, optionsKey({ fps: 60, media, args: { find: ['the pool'], songFrom: 1 } }));
assert.notEqual(k1, optionsKey({ fps: 30, media, args: { find: ['the club'], songFrom: 1 } }));

assert.equal(cacheable({ clips: [] }), true);
assert.equal(cacheable({ watching: '3 of 9' }), false);
assert.equal(cacheable({ error: 'x' }), false);
assert.equal(cacheable({ clips: [], tagsNote: 'still reading' }), false);
assert.equal(cacheable({ clips: [], shots: { unavailable: 'model loading' } }), false);
assert.equal(cacheable(null), false);

forgetOptions();
rememberOptions('p1', k1, { clips: ['#1'] }, { fps: 30 }, 1000);
assert.deepEqual(cachedOptions('p1', k1, 2000)?.result, { clips: ['#1'] });
assert.equal(cachedOptions('p1', 'other', 2000), undefined);
assert.equal(cachedOptions('p2', k1, 2000), undefined);
assert.equal(cachedOptions('p1', k1, 1000 + OPTIONS_CACHE_MS + 1), undefined);
assert.deepEqual(pickStage1({ fps: 30, clips: [], treatment: { story: 'x' } as never, history: [['cut']] }), { fps: 30, clips: [] });
console.log('directorOptionsCache.verify: ok');
