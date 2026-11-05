import assert from 'node:assert/strict';
import { EN } from './index';
import { rebrandEntries } from './reelsmithBranding';

assert.deepEqual(rebrandEntries({ a: 'Expand OpenChatCut Agent', b: 'Plain' }), { a: 'Expand Reelsmith Agent' });
const leftover = Object.entries(EN).filter(([, v]) => v.includes('OpenChatCut'));
assert.deepEqual(leftover, [], 'no English UI string names OpenChatCut');
assert.equal(EN['展开 OpenChatCut Agent'], 'Expand Reelsmith Agent');
console.log('reelsmithBranding: ok');
