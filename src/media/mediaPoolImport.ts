import type { MediaAsset } from '../editor/types';
import { isMediaImportCancelled } from './mediaImportConflict';

interface MediaImportLifecycle {
  onPlaceholder?: (asset: MediaAsset) => void;
  onAssetUpdated?: (asset: MediaAsset) => void;
  onFailure?: (asset: MediaAsset | null, error: unknown) => void;
}

interface ImportMediaBatchOptions {
  files: readonly File[];
  targetFolderId?: string;
  targetFolderIds?: readonly (string | undefined)[];
  onImport: (
    file: File,
    onProgress?: (ratio: number) => void,
    lifecycle?: MediaImportLifecycle,
  ) => Promise<MediaAsset>;
  onMoveAssets: (ids: string[], folderId?: string) => void;
  onProgress: (ratio: number) => void;
}

/**
 * How many files may upload and normalize at once. Twenty phone clips started together
 * all finish late (and keep the CPU busy for everything else); a few at a time make the
 * first clips usable early.
 */
export const MAX_CONCURRENT_IMPORTS = 3;

/**
 * Starts files sequentially through their first lifecycle event, while allowing
 * already-started files to finish in parallel. Failures never prevent the next
 * file from starting; callers surface the first error after the batch settles.
 */
export async function importMediaBatch({
  files,
  targetFolderId,
  targetFolderIds,
  onImport,
  onMoveAssets,
  onProgress,
}: ImportMediaBatchOptions): Promise<unknown[]> {
  const completions: Promise<void>[] = [];
  const completionErrors: unknown[] = [];
  const active = new Set<Promise<void>>();
  // Overall progress is the mean over all files: files in flight at the same time must not
  // push each other's share, or the total reads ~100% while earlier files are still working.
  const ratios = files.map(() => 0);
  const reportProgress = (index: number, ratio: number) => {
    ratios[index] = Math.max(ratios[index]!, Math.min(1, ratio));
    onProgress(ratios.reduce((sum, value) => sum + value, 0) / files.length);
  };

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    let started = false;
    let failureRecorded = false;
    let resolveStarted!: () => void;
    const firstLifecycleEvent = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const settleStarted = () => {
      if (started) return;
      started = true;
      resolveStarted();
    };
    const placeAsset = (asset: MediaAsset) => {
      const folderId = targetFolderIds?.[index] ?? targetFolderId;
      if (folderId) onMoveAssets([asset.id], folderId);
      settleStarted();
    };
    const recordFailure = (reason: unknown) => {
      reportProgress(index, 1);
      if (!failureRecorded && !isMediaImportCancelled(reason)) {
        failureRecorded = true;
        completionErrors.push(reason);
      }
      settleStarted();
    };
    let readyAssetId: string | undefined;

    let completion: Promise<void>;
    try {
      completion = onImport(file, (ratio) => reportProgress(index, ratio), {
        onPlaceholder: placeAsset,
        onAssetUpdated: (asset) => {
          readyAssetId = asset.id;
          placeAsset(asset);
        },
        onFailure: (_asset, reason) => recordFailure(reason),
      }).then((asset) => {
        if (readyAssetId !== asset.id) placeAsset(asset);
        reportProgress(index, 1);
      }).catch(recordFailure);
    } catch (reason) {
      recordFailure(reason);
      completion = Promise.resolve();
    }

    completions.push(completion);
    const tracked = completion.finally(() => { active.delete(tracked); });
    active.add(tracked);
    await firstLifecycleEvent;
    while (active.size >= MAX_CONCURRENT_IMPORTS && index < files.length - 1) await Promise.race(active);
  }

  await Promise.all(completions);
  return completionErrors;
}
