// Reelsmith: a running model download can be cancelled, keeps its finished files, and reports bytes between files.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { asrModelEntry } from '../../shared/asr-models.ts';
import {
  __asrCatalogForVerify, __asrTaskForVerify, __cancelAsrDownloadForVerify, __resetAsrTasks, __startAsrDownloadForVerify,
} from './asr-models.ts';
import type { downloadModelFile } from './hf-proxy.ts';

const cache = await mkdtemp(join(tmpdir(), 'asr-cancel-'));
const entry = asrModelEntry('tiny')!;
const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 20); });
const row = async () => (await __asrCatalogForVerify(cache)).find((m) => m.id === 'tiny')!;

try {
  __resetAsrTasks();
  // stand-in transport: file 1 completes, file 2 writes 1500 bytes of a partial and then waits until it is aborted
  let calls = 0;
  const seen: Array<AbortSignal | undefined> = [];
  const hanging = (async (_target, destination, options) => {
    calls += 1;
    seen.push(options?.signal);
    await mkdir(dirname(destination!), { recursive: true });
    if (calls === 1) { await writeFile(destination!, 'complete'); return destination!; }
    await writeFile(`${destination}.part`, Buffer.alloc(1500));
    await new Promise<never>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
    });
    return destination!;
  }) as typeof downloadModelFile;

  const task = await __startAsrDownloadForVerify('tiny', cache, hanging);
  assert.equal(task.status, 'downloading');
  await tick(); await tick();
  assert.ok(seen.length >= 2 && seen.every((s) => s instanceof AbortSignal), 'the abort signal reaches the transport');

  // progress between files: the bytes of the partial file show up in the row
  const running = await row();
  assert.equal(running.task?.status, 'downloading');
  assert.equal(running.task?.partialBytes, 1500, 'bytes on disk for the file in flight');

  // cancel: true once, the task disappears (not an error), and nothing is left running
  assert.equal(__cancelAsrDownloadForVerify('tiny'), true);
  await tick(); await tick();
  assert.equal(__asrTaskForVerify('tiny'), undefined, 'a cancelled download leaves no task, so the row offers Download again');
  assert.equal((await row()).task, undefined);
  assert.equal(__cancelAsrDownloadForVerify('tiny'), false, 'nothing left to cancel');
  assert.equal(__cancelAsrDownloadForVerify('does-not-exist'), false);

  // the finished first file is kept, the next Download carries on from it
  const firstFile = entry.files[0]!.path;
  assert.ok(existsSync(join(cache, entry.modelId, ...firstFile.split('/'))), 'a finished file survives the cancel');

  // a real failure is still an error, not a silent cancel
  calls = 0;
  const failing = (async () => { throw new Error('network down'); }) as typeof downloadModelFile;
  await __startAsrDownloadForVerify('tiny', cache, failing);
  await tick(); await tick();
  assert.equal(__asrTaskForVerify('tiny')?.status, 'error');
  assert.match(__asrTaskForVerify('tiny')?.error ?? '', /network down/);

  // and a download can be started again after a cancel
  __resetAsrTasks();
  await __startAsrDownloadForVerify('tiny', cache, hanging);
  await tick();
  assert.equal(__cancelAsrDownloadForVerify('tiny'), true);
  await tick(); await tick();
  assert.equal(__asrTaskForVerify('tiny'), undefined);
  console.log('asr-model-cancel.verify ok');
} finally {
  __resetAsrTasks();
  await rm(cache, { recursive: true, force: true });
}
