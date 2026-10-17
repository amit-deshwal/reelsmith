// RS-301: a recovered/retried export must write the .srt sidecar exactly like a first-try export does.
import assert from 'node:assert/strict';
import { createExportJobStore } from '../export/backgroundExportStore';
import type { ExportDestination } from '../export/exportDestination';
import { resumePersistedServerExports } from '../export/serverExportOperation';
import { persistServerExportJob, resetServerExportRecoveryMemory } from '../export/serverExportRecovery';

const originalFetch = globalThis.fetch;
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'http://localhost:5199/' } } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });

const talking = {
  id: 'clip1', track: 'V1', startFrame: 0, durationInFrames: 120, name: 'talk', kind: 'video',
  transcript: [{ text: 'hello', start: 0, end: 400 }, { text: 'world', start: 450, end: 900 }],
};
const state = { width: 1080, height: 1920, fps: 30, items: [talking], transitions: [], markers: [], tracks: { C1: { kind: 'caption', captions: { enabled: true, template: 'plain', pacing: 'phrase', sourceItemId: 'clip1' } } } };

async function runRetry(renderId: string, srt: boolean): Promise<{ names: string[]; srtText: string }> {
  store.set('reelsmith:instagram-export', JSON.stringify({ enabled: true, silent: false, srt }));
  resetServerExportRecoveryMemory();
  const names: string[] = [];
  let srtText = '';
  const destination: ExportDestination = {
    type: 'browser-directory', label: 'Exports',
    handle: {
      kind: 'directory', name: 'Exports', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFileHandle: async (name: string) => {
        names.push(name);
        return { createWritable: async () => ({ write: async (data: unknown) => { if (name.endsWith('.srt')) srtText = await new Blob([data as BlobPart]).text(); }, close: async () => undefined }) };
      },
    },
  };
  await persistServerExportJob({
    version: 1, renderId, projectId: 'project-retry', label: 'retry.mp4', targetPath: 'Exports/retry.mp4', createdAt: 10, updatedAt: 10,
    format: 'video', codec: 'h264', base: 'retry', fps: 30, state: state as never, destination, autoQaEnabled: false, stage: 'polling',
  });
  let deleted!: () => void;
  const gone = new Promise<void>((resolve) => { deleted = resolve; });
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === `/export/job/${renderId}` && init?.method === 'DELETE') { deleted(); return new Response(null, { status: 204 }); }
    if (url === `/export/job/${renderId}`) return Response.json({ status: 'succeeded', progress: 100, result: { path: '/media/retry.mp4', name: 'retry.mp4', sizeBytes: 5 } });
    if (url.endsWith('/media/retry.mp4')) return new Response('video');
    if (url.endsWith('/api/reelsmith/instagram-finalize')) return Response.json({ error: 'not available in this test' }, { status: 500 });
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
  const jobs = createExportJobStore();
  await resumePersistedServerExports({ exportJobs: jobs, projectId: 'project-retry', t: (key) => key });
  await gone;
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  assert.equal(jobs.getSnapshot().jobs[0]?.progress.phase, 'completed', jobs.getSnapshot().jobs[0]?.error ?? undefined);
  return { names, srtText };
}

try {
  const on = await runRetry('render-retry-on', true);
  assert.ok(on.names.includes('retry.mp4'), 'the video is delivered');
  assert.ok(on.names.includes('retry.srt'), `the retried export writes the .srt (wrote: ${on.names.join(', ')})`);
  assert.ok(on.srtText.includes('hello world'), 'the .srt holds the caption text');

  const off = await runRetry('render-retry-off', false);
  assert.ok(off.names.includes('retry.mp4'));
  assert.ok(!off.names.some((n) => n.endsWith('.srt')), 'no .srt when the option is off');
  console.log('retrySidecar.verify ok');
} finally {
  resetServerExportRecoveryMemory();
  globalThis.fetch = originalFetch;
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else Reflect.deleteProperty(globalThis, 'window');
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor); else Reflect.deleteProperty(globalThis, 'localStorage');
}
