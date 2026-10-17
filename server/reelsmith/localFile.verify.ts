// The analysis routes accept imported files and the bundled library songs, and nothing else.
import assert from 'node:assert/strict';
import { analyzeBeatsFile } from './beatDetect';
import { localFile } from './analyze-plugin';

for (const n of [1, 2, 3]) {
  const file = localFile(`/audio/track-${n}.mp3`);
  assert.equal(typeof file, 'string', `library song ${n} resolves`);
  const grid = await analyzeBeatsFile(file as string);
  assert.ok(grid && grid.beatTimesSec.length >= 10, `library song ${n} has a steady beat`);
}
for (const bad of ['/audio/../package.json', '/audio/nope.mp3', '/audio/sub/track-1.mp3', '/etc/passwd', '../../etc/passwd', 42, undefined]) {
  assert.ok(typeof localFile(bad) === 'object' && 'error' in (localFile(bad) as object), `rejects ${String(bad)}`);
}
console.log('localFile verify ok');
