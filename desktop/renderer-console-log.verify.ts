import assert from 'node:assert/strict';
import { consoleEntry, formatLogLine } from './renderer-console-log.ts';

const modern = consoleEntry([{ level: 'warning', message: '[export] browser fast export stopped', lineNumber: 12, sourceId: 'app.js' }]);
assert.deepEqual(modern, { level: 'warning', message: '[export] browser fast export stopped', source: 'app.js:12' });

const legacy = consoleEntry([{}, 3, 'boom', 4, 'x.js']);
assert.deepEqual(legacy, { level: 'error', message: 'boom', source: 'x.js:4' });

assert.equal(consoleEntry([{}]), null);
assert.equal(
  formatLogLine({ level: 'error', message: 'bad\n', source: '' }, new Date('2026-11-18T00:00:00Z')),
  '2026-11-18T00:00:00.000Z ERROR bad\n',
);
console.log('renderer-console-log.verify: ok');
