// A take that froze is rendered once more (Cardboard 2026-10-20: "checks that the file plays from start to finish, and
// makes it again if it doesn't"). V10 (RS-1231) flags frozen or stuttering picture nobody placed; a re-encode cannot fix
// that, but a fresh render often can (stalls came from a renderer under load or a long-running server, not the
// timeline). The better take is delivered and the other render job is retired.
import { instagramReportStore, type InstagramExportReport } from './instagramExport';

export interface Take<C> { renderId: string; completed: C }

/** The take froze or stuttered where nothing was placed to stand still (V10 warns). */
export const stalled = (report: InstagramExportReport | null | undefined): boolean =>
  !!report?.checks?.some((c) => c.id === 'V10' && c.status === 'WARN');

const usable = (report: InstagramExportReport) => report.status === 'passed' || report.status === 'fixed';

export async function retakeIfStalled<C>(first: Take<C>, o: {
  render: () => Promise<Take<C>>;
  finalize: (completed: C) => Promise<InstagramExportReport>;
  retire: (renderId: string) => Promise<unknown>;
  setBusy?: (text: string | null) => void;
  signal?: AbortSignal;
}): Promise<Take<C>> {
  const firstReport = instagramReportStore.get();
  if (!firstReport || !stalled(firstReport)) return first;
  const why = firstReport.checks?.find((c) => c.id === 'V10')?.detail.split(';')[0] ?? 'frozen picture';
  o.setBusy?.('The export froze in places; rendering it again…');
  let second: Take<C>;
  try { second = await o.render(); }
  catch (error) {
    o.signal?.throwIfAborted();
    instagramReportStore.set({ ...firstReport, message: `The first take froze (${why}); rendering it again failed: ${error instanceof Error ? error.message : String(error)}.` });
    return first;
  }
  const secondReport = await o.finalize(second.completed);
  if (usable(secondReport) && !stalled(secondReport)) {
    await o.retire(first.renderId).catch(() => false);
    instagramReportStore.set({ ...secondReport, message: `Rendered twice: the first take froze (${why}); this one plays through.` });
    return second;
  }
  await o.retire(second.renderId).catch(() => false);
  instagramReportStore.set({ ...firstReport, message: `Rendered twice and both takes froze (${why}). If the preview plays smoothly there, restart the app and export again.` });
  return first;
}
