import assert from 'node:assert/strict';
import { LruCache } from './frameCache';
import { BEHIND_WORDS, behindWord } from './behindText';

const c = new LruCache<number>(3);
c.set('a', 1); c.set('b', 2); c.set('c', 3);
assert.equal(c.get('a'), 1);          // a is now the freshest
c.set('d', 4);                        // evicts b, the stalest
assert.equal(c.get('b'), undefined);
assert.deepEqual([c.get('a'), c.get('c'), c.get('d')], [1, 3, 4]);
assert.equal(c.size, 3);
c.set('a', 9);
assert.equal(c.get('a'), 9);
assert.equal(c.size, 3);

assert.equal(behindWord(0), BEHIND_WORDS[0]);
assert.equal(behindWord(-4), BEHIND_WORDS[0]);
assert.equal(behindWord(999), BEHIND_WORDS[BEHIND_WORDS.length - 1]);
assert.equal(behindWord(NaN), BEHIND_WORDS[0]);
assert.ok(BEHIND_WORDS.every((w) => w === w.toUpperCase() && w.length <= 16), 'short capitals');
console.log('frameCache.verify ok');
