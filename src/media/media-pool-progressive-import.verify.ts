import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { MediaImportCancelledError } from './mediaImportConflict';
import { importMediaBatch, MAX_CONCURRENT_IMPORTS } from './mediaPoolImport';

const failedProbe = new Error('unsupported media type');
const starts: string[] = [];
const successful = { id: 'good', name: 'good.mov' } as MediaAsset;
const firstBatchErrors = await importMediaBatch({
  files: [{ name: 'bad.txt' } as File, { name: 'good.mov' } as File],
  targetFolderId: 'folder-a',
  onImport: async (file, _onProgress, lifecycle) => {
    starts.push(file.name);
    if (file.name === 'bad.txt') throw failedProbe;
    lifecycle?.onPlaceholder?.(successful);
    return successful;
  },
  onMoveAssets: () => undefined,
  onProgress: () => undefined,
});

assert.deepEqual(starts, ['bad.txt', 'good.mov'], '单文件在 placeholder 前失败后仍须继续导入后续文件');
assert.deepEqual(firstBatchErrors, [failedProbe], '批次结束后只汇总实际导入失败');

const conflictStarts: string[] = [];
const conflictPlacements: string[] = [];
const overwritten = { id: 'overwrite', name: 'same-name.mov' } as MediaAsset;
const conflictErrors = await importMediaBatch({
  files: [{ name: 'cancel.mov' } as File, { name: 'same-name.mov' } as File],
  targetFolderId: 'folder-b',
  onImport: async (file) => {
    conflictStarts.push(file.name);
    if (file.name === 'cancel.mov') throw new MediaImportCancelledError();
    return overwritten;
  },
  onMoveAssets: (ids, folderId) => conflictPlacements.push(`${ids[0]}:${folderId}`),
  onProgress: () => undefined,
});

assert.deepEqual(conflictStarts, ['cancel.mov', 'same-name.mov'], '无 placeholder 的取消不能阻断后续覆盖导入');
assert.deepEqual(conflictErrors, [], '用户取消不应显示为批次失败');
assert.deepEqual(conflictPlacements, ['overwrite:folder-b'], '无 placeholder 的覆盖结果仍须进入目标文件夹');

// twelve files: never more than the cap in flight, and the total never runs ahead of the files actually started
let inFlight = 0;
let peak = 0;
let worstOverrun = 0;
let finished = 0;
const names = Array.from({ length: 12 }, (_, i) => `clip${i}.mov`);
const manyErrors = await importMediaBatch({
  files: names.map((name) => ({ name }) as File),
  onImport: async (file, onProgress, lifecycle) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    const asset = { id: file.name, name: file.name } as MediaAsset;
    lifecycle?.onPlaceholder?.(asset);
    for (const ratio of [0.4, 0.92]) { await new Promise((resolve) => setTimeout(resolve, 2)); onProgress?.(ratio); }
    await new Promise((resolve) => setTimeout(resolve, 2));
    onProgress?.(1);
    inFlight -= 1; finished += 1;
    return asset;
  },
  onMoveAssets: () => undefined,
  // the total can only count files that finished plus the ones in flight (each at most one share)
  onProgress: (ratio) => { worstOverrun = Math.max(worstOverrun, ratio - (finished + inFlight) / names.length); },
});
assert.deepEqual(manyErrors, []);
assert.ok(peak <= MAX_CONCURRENT_IMPORTS, `at most ${MAX_CONCURRENT_IMPORTS} imports at once, saw ${peak}`);
assert.ok(worstOverrun <= 1e-9, `progress is a mean over all files; it ran ${worstOverrun} ahead of the files started`);

console.log('media-pool-progressive-import.verify: failures and conflict choices preserve batch progress');
