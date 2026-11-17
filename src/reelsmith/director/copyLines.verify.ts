import assert from 'node:assert/strict';
import { copiedRun, quotedPhrases } from './copyLines';

// RS-1271 (2): the Goa run's lines, each a phrase of the brief
const brief = 'Goa trip with the boys: the red Thar road trip, beach cafes and the sea, pool jumps, and clubbing all night';
assert.equal(copiedRun('GOA TRIP WITH THE BOYS', brief), 'goa trip with the boys');
assert.equal(copiedRun('BEACH CAFES AND THE SEA', brief), 'beach cafes and the sea');
assert.equal(copiedRun('POOL JUMPS', brief), undefined); // two words may be a fact as much as a copy
assert.equal(copiedRun('CLUBBING ALL NIGHT', brief), 'clubbing all night');
assert.equal(copiedRun('the red Thar road trip', brief), 'the red thar road trip');
// lines of the director's own pass, names from the brief included
assert.equal(copiedRun('4 BOYS. 1 THAR. ZERO PLANS.', brief), undefined);
assert.equal(copiedRun('SUNBURNT AND SALTY', brief), undefined);
assert.equal(copiedRun('GOA HITS DIFFERENT', brief), undefined);
assert.equal(copiedRun('NIGHT', brief), undefined);
// a run never spans the brief's punctuation; two stop words and one word of meaning are not a copy
assert.equal(copiedRun('boys the red', brief), undefined);
assert.equal(copiedRun('and the sea', brief), undefined);
// a phrase the user quoted is theirs to use
const quoted = 'our trek, put "never again" at the end and "worth it" on the summit';
assert.deepEqual(quotedPhrases(quoted), ['never again', 'worth it']);
assert.equal(copiedRun('NEVER AGAIN', quoted), undefined);
assert.equal(copiedRun('worth it', quoted), undefined);
assert.equal(copiedRun('anything', ''), undefined);

console.log('copyLines.verify: ok');
