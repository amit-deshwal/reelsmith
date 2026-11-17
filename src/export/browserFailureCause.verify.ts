import assert from 'node:assert/strict';
import { browserFailureCause } from './browserExport';

assert.equal(browserFailureCause(new Error('first line\nstack-ish second')), 'first line');
assert.equal(browserFailureCause(new DOMException('decode failed', 'EncodingError')), 'EncodingError: decode failed');
assert.equal(browserFailureCause('x'.repeat(300)).length, 160);
assert.equal(browserFailureCause(undefined), '');
console.log('browserFailureCause.verify: ok');
