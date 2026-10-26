// RS-304: the priming remux only runs on exports from Remotion versions that leave the AAC priming in.
import assert from 'node:assert/strict';
import { remotionLeavesPriming } from './audioPriming.ts';

assert.equal(remotionLeavesPriming('Made with Remotion 4.0.509'), true);
assert.equal(remotionLeavesPriming('Made with Remotion 4.0.530'), true);
assert.equal(remotionLeavesPriming('Made with Remotion 3.9.999'), true);
assert.equal(remotionLeavesPriming('Made with Remotion 4.0.531'), false);
assert.equal(remotionLeavesPriming('Made with Remotion 4.0.537'), false);
assert.equal(remotionLeavesPriming('Made with Remotion 4.1.0'), false);
assert.equal(remotionLeavesPriming('Made with Remotion 5.0.0'), false);
// An unversioned Remotion comment keeps the old behaviour; anything else is not ours to touch.
assert.equal(remotionLeavesPriming('Made with Remotion'), true);
assert.equal(remotionLeavesPriming('Lavf63.1.102'), false);
assert.equal(remotionLeavesPriming(''), false);
console.log('audioPriming.verify ok');
