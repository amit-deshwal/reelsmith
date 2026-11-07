// The extra files of an export (sheet, cover, .srt, no-song copy) go beside the video, never over it.
// Found 2026-11-08: with a file picked in the desktop save panel, every sidecar write took the picked name, so the
// no-song copy (written last) replaced the reel itself.
import assert from 'node:assert/strict';
import { writeBlobToDestination, writeSidecarToDestination, type ExportDestination } from '../export/exportDestination';

const grantId = 'a'.repeat(43);
const requests: string[] = [];
const downloads: string[] = [];
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'http://localhost:5199/' } } });
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement: () => ({ click() { downloads.push(this.download); }, remove() {}, href: '', download: '' }),
    body: { appendChild() {} },
  },
});
const createObjectURL = URL.createObjectURL;
URL.createObjectURL = () => 'blob:x';
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requests.push(decodeURIComponent(String(input)));
  return new Response(null, { status: 204 });
}) as typeof fetch;

try {
  const picked: ExportDestination = { type: 'desktop-file', grantId, label: 'Trek.mp4', filename: 'Trek.mp4' };
  await writeBlobToDestination(picked, 'New reel.mp4', new Blob(['video']));
  await writeSidecarToDestination(picked, 'Trek.cover.jpg', new Blob(['jpg']));
  await writeSidecarToDestination(picked, 'Trek.no-song.mp4', new Blob(['mp4']));
  assert.deepEqual(requests, [
    `/api/export-destinations/${grantId}/Trek.mp4`,
    `/api/export-destinations/${grantId}/Trek.cover.jpg`,
    `/api/export-destinations/${grantId}/Trek.no-song.mp4`,
  ], 'the video takes the picked name; each sidecar keeps its own, in the same folder');
  await assert.rejects(() => writeSidecarToDestination(picked, 'Trek.mp4', new Blob(['x'])), /导出文件名无效/,
    'a sidecar may never take the video\'s own name');
  await assert.rejects(() => writeSidecarToDestination(picked, 'Trek.sheet.jpg', new Blob()), /导出文件为空/);

  requests.length = 0;
  const folder: ExportDestination = { type: 'desktop-directory', grantId, label: 'Downloads' };
  await writeSidecarToDestination(folder, 'New reel.sheet.jpg', new Blob(['jpg']));
  assert.deepEqual(requests, [`/api/export-destinations/${grantId}/New reel.sheet.jpg`]);

  const handle = {
    kind: 'file', name: 'Trek.mp4',
    createWritable: async () => { throw new Error('the picked file is not touched'); },
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
  } as unknown as Extract<ExportDestination, { type: 'browser-file' }>['handle'];
  await writeSidecarToDestination({ type: 'browser-file', label: 'Trek.mp4', handle }, 'Trek.cover.jpg', new Blob(['jpg']));
  await writeSidecarToDestination({ type: 'downloads', label: 'Browser downloads' }, 'Trek.srt', new Blob(['1']));
  assert.deepEqual(downloads, ['Trek.cover.jpg', 'Trek.srt'], 'a browser file handle reaches no folder: sidecars download');
  console.log('exportSidecars.verify: sidecars land beside the picked file, never over it');
} finally {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = createObjectURL;
}
setTimeout(() => process.exit(0), 0);
