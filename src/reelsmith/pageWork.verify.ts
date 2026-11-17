import assert from 'node:assert/strict';
import { pageWork, pageWorkState } from './pageWork';

// RS-1272 (1): faces run side by side; the visual model's reading waits for them and then runs alone; faces that arrive
// while it waits go after it (no starvation either way)
const log: string[] = [];
const job = (name: string, kind: 'faces' | 'vectors', ms: number) => pageWork(kind, async () => { log.push(`${name}+`); await new Promise((r) => setTimeout(r, ms)); log.push(`${name}-`); return name; });
const all = Promise.all([job('f1', 'faces', 30), job('f2', 'faces', 30), job('v1', 'vectors', 10), job('f3', 'faces', 10)]);
assert.deepEqual(pageWorkState(), { active: 'faces', running: 2, waiting: 2 });
assert.deepEqual(await all, ['f1', 'f2', 'v1', 'f3']);
const at = (e: string) => log.indexOf(e);
assert.ok(at('v1+') > at('f1-') && at('v1+') > at('f2-'), log.join(' '));
assert.ok(at('f3+') > at('v1-'), 'faces that came after the waiting reading go after it');
// a failing job frees its turn
await assert.rejects(pageWork('vectors', async () => { throw new Error('boom'); }));
assert.equal(await pageWork('faces', async () => 'ok'), 'ok');
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(pageWorkState(), { active: null, running: 0, waiting: 0 });
console.log('pageWork.verify: ok');
