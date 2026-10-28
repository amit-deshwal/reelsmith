import assert from 'node:assert/strict';
import { instagramReportStore, type InstagramExportReport } from './instagramExport';
import { retakeIfStalled, stalled } from './exportRetake';

const v10 = (status: 'PASS' | 'WARN'): InstagramExportReport => ({
  status: 'passed',
  checks: [{ id: 'V1', status: 'PASS', detail: 'mp4' }, { id: 'V10', status, detail: status === 'WARN' ? 'frozen 0.8 s at 9.2 s; if the preview plays smoothly there, restart the app and export again' : 'no frozen or stuttering picture' }],
});
const harness = (second: InstagramExportReport | Error) => {
  const retired: string[] = [];
  let renders = 0;
  return {
    retired, renders: () => renders,
    o: {
      render: async () => { renders += 1; if (second instanceof Error) throw second; return { renderId: 'r2', completed: 'take2' }; },
      finalize: async (c: string) => { assert.equal(c, 'take2'); if (!(second instanceof Error)) instagramReportStore.set(second); return second as InstagramExportReport; },
      retire: async (id: string) => { retired.push(id); },
    },
  };
};
const first = { renderId: 'r1', completed: 'take1' };

assert.equal(stalled(v10('WARN')), true);
assert.equal(stalled(v10('PASS')), false);
assert.equal(stalled(null), false);

// a clean take is delivered as is: nothing rendered again
{
  instagramReportStore.set(v10('PASS'));
  const h = harness(v10('PASS'));
  assert.deepEqual(await retakeIfStalled(first, h.o), first);
  assert.equal(h.renders(), 0);
}
// a take that froze is rendered again; a clean second take wins and the first job is retired
{
  instagramReportStore.set(v10('WARN'));
  const h = harness(v10('PASS'));
  assert.deepEqual(await retakeIfStalled(first, h.o), { renderId: 'r2', completed: 'take2' });
  assert.deepEqual(h.retired, ['r1']);
  assert.match(instagramReportStore.get()!.message!, /Rendered twice: the first take froze \(frozen 0.8 s at 9.2 s\)/);
  assert.equal(stalled(instagramReportStore.get()), false, 'the dialog shows the clean take');
}
// both takes froze: the first is kept, the second retired, and the user is told to restart
{
  instagramReportStore.set(v10('WARN'));
  const h = harness(v10('WARN'));
  assert.deepEqual(await retakeIfStalled(first, h.o), first);
  assert.deepEqual(h.retired, ['r2']);
  assert.match(instagramReportStore.get()!.message!, /both takes froze.*restart the app/);
}
// a second take that fails the Instagram checks is not delivered
{
  instagramReportStore.set(v10('WARN'));
  const h = harness({ ...v10('PASS'), status: 'failed' });
  assert.deepEqual(await retakeIfStalled(first, h.o), first);
  assert.deepEqual(h.retired, ['r2']);
}
// the second render failing keeps the first take; cancelling the export still cancels
{
  instagramReportStore.set(v10('WARN'));
  const h = harness(new Error('renderer crashed'));
  assert.deepEqual(await retakeIfStalled(first, h.o), first);
  assert.match(instagramReportStore.get()!.message!, /rendering it again failed: renderer crashed/);
  const ac = new AbortController();
  ac.abort();
  instagramReportStore.set(v10('WARN'));
  await assert.rejects(retakeIfStalled(first, { ...harness(new Error('aborted')).o, signal: ac.signal }));
}
console.log('exportRetake: ok');
