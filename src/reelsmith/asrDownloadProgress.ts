// Download progress for the local Whisper models. Upstream counted finished files only, so a 1 GB model sat on one
// number for minutes and looked frozen. The server now reports the bytes already on disk for the file in flight
// (`partialBytes`), and progress follows the bytes. It never shows 100% until the task is done.
import type { AsrDownloadTask } from '../../shared/asr-models';

export function downloadPercent(task: Partial<Pick<AsrDownloadTask, 'bytesDone' | 'bytesTotal' | 'filesDone' | 'filesTotal' | 'partialBytes'>>): number {
  const total = task.bytesTotal ?? 0;
  if (total > 0) {
    const fraction = ((task.bytesDone ?? 0) + Math.max(0, task.partialBytes ?? 0)) / total;
    return Math.max(0, Math.min(99, Math.floor(fraction * 100)));
  }
  const files = task.filesTotal ?? 0;
  return files > 0 ? Math.max(0, Math.min(99, Math.floor(((task.filesDone ?? 0) / files) * 100))) : 0;
}
