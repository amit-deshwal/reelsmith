import assert from 'node:assert/strict';
import { downloadPercent } from './asrDownloadProgress';

const base = { bytesTotal: 1000, bytesDone: 0, filesTotal: 5, filesDone: 0 };
assert.equal(downloadPercent(base), 0);
// moves with the bytes of the file in flight, even though no file has finished
assert.equal(downloadPercent({ ...base, partialBytes: 250 }), 25);
assert.equal(downloadPercent({ ...base, bytesDone: 400, partialBytes: 100 }), 50);
// never shows 100% while still downloading (the task flips to done at the end)
assert.equal(downloadPercent({ ...base, bytesDone: 1000, partialBytes: 50 }), 99);
// bad numbers cannot go below 0 or above 99
assert.equal(downloadPercent({ ...base, partialBytes: -500 }), 0);
// older servers without byte totals fall back to counting files
assert.equal(downloadPercent({ filesTotal: 5, filesDone: 2 }), 40);
assert.equal(downloadPercent({}), 0);
console.log('asrDownloadProgress.verify ok');
