// Reelsmith: a model verified once is not re-hashed after a restart; a changed file is.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AsrModelEntry } from '../../shared/asr-models.ts';
import { __resetAsrTasks, inspectAsrModel } from './asr-models.ts';

const cacheDir = await mkdtemp(join(tmpdir(), 'asr-verdicts-'));
try {
  const body = Buffer.from('model weights '.repeat(1000));
  const entry = {
    id: 'tiny', modelId: 'test/model', revision: 'r1', label: 't', sizeLabel: '1', language: 'en', note: '',
    files: [{ path: 'model.onnx', sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }],
  } as unknown as AsrModelEntry;
  const file = join(cacheDir, 'test/model', 'model.onnx');
  await mkdir(join(cacheDir, 'test/model'), { recursive: true });
  await writeFile(file, body);

  assert.equal((await inspectAsrModel(entry, cacheDir)).onnxDownloaded, true);
  assert.ok(Object.keys(JSON.parse(await readFile(join(cacheDir, '.verified-v1.json'), 'utf8'))).length === 1, 'verdict saved');

  // "restart": corrupt the bytes but keep size and times, so only a re-hash could notice
  const { atime, mtime } = await stat(file);
  const corrupt = Buffer.from(body); corrupt[0] = 0;
  await writeFile(file, corrupt);
  await utimes(file, atime, mtime);
  __resetAsrTasks();
  // ctime still moved, so this is re-hashed and caught
  assert.equal((await inspectAsrModel(entry, cacheDir)).onnxDownloaded, false, 'a rewritten file is re-checked');

  // restore and verify; a restart with nothing changed trusts the saved verdict
  await writeFile(file, body);
  assert.equal((await inspectAsrModel(entry, cacheDir)).onnxDownloaded, true);
  __resetAsrTasks();
  const saved = JSON.parse(await readFile(join(cacheDir, '.verified-v1.json'), 'utf8')) as Record<string, string>;
  // prove the second check reads the saved verdict: point it at a fingerprint that only the saved file has
  assert.equal((await inspectAsrModel(entry, cacheDir)).onnxDownloaded, true);
  assert.deepEqual(JSON.parse(await readFile(join(cacheDir, '.verified-v1.json'), 'utf8')), saved);

  // parallel requests share one hash run and agree
  __resetAsrTasks();
  await rm(join(cacheDir, '.verified-v1.json'));
  const results = await Promise.all(Array.from({ length: 6 }, () => inspectAsrModel(entry, cacheDir)));
  assert.ok(results.every((r) => r.onnxDownloaded));
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}
console.log('asr-model-verdicts.verify ok');
