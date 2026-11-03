import { captionTrackEntries } from '../editor/types';
import { finalizeExportForInstagram, instagramReportStore, loadInstagramPreference, isSupportedShape } from '../reelsmith/instagramExport';
import { writeSrtSidecar } from '../reelsmith/instagramSrt';
import { deliverReviewSheet } from '../reelsmith/exportReview';
import { deliverCover } from '../reelsmith/exportCover';
import { deliverNoSoundCopy } from '../reelsmith/exportMusic';
import { retakeIfStalled } from '../reelsmith/exportRetake';
import { withDepthMaps } from '../reelsmith/depthMaps';
import type { BackgroundExportJobSetters, ExportJobStore } from './backgroundExportStore';
import { isAbortError } from './browserExport';
import { recordExport } from '../persist/exportHistoryStore';
import {
  ensureExportDestinationWritable,
  ExportDestinationError,
  exportDestinationErrorMessage,
  exportDestinationFilename,
  exportHistoryDestinationId,
  writeBlobToDestination,
  writeUrlToDestination,
  type ExportDestination,
} from './exportDestination';
import { recordExportPerformance } from './exportRoutePlanner';
import { exportMediaExtension } from './exportMediaExtension';
import {
  createExportFailure,
  exportFailureFrom,
} from './exportFailure';
import { createExportVerifier } from './exportQaOperation';
import {
  checkServerExportDelivery,
  claimServerExportDelivery,
  hasServerExportDestinationAuthority,
  listServerExportJobs,
  markServerExportDeliveryAmbiguous,
  markServerExportOutputReady,
  markServerExportTargetCommitted,
  rebindServerExportJob,
  releaseServerExportDelivery,
  renewServerExportDelivery,
  type PersistedServerExportJob,
  type ServerExportDeliveryClaim,
} from './serverExportRecovery';
import {
  pollExport,
  renderCompleted,
  retireAndDeleteExportJob,
  type ExportCodec,
  type ExportFormat,
  type ServerExportContext,
} from './serverExportRenderOperation';
import type {
  ExportJobResult,
  Translate,
  UseExportWorkflowOptions,
} from './exportWorkflowTypes';
import { t as translate } from '../i18n/locale';
export { isServerRenderError, ServerRenderError } from './serverExportRenderOperation';

function updateActualEngine(context: ServerExportContext, completed: ExportJobResult): void {
  if (!completed.encoder) return;
  context.setEngineInfo(completed.encoder);
  if (completed.encoderFallbackReason) context.setEngineReason(completed.encoderFallbackReason);
}

async function writeCompletedWithLease(
  context: ServerExportContext,
  filename: string,
  path: string,
  renderId: string,
  claim: ServerExportDeliveryClaim,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    void renewServerExportDelivery(renderId, claim)
      .then((active) => {
        if (!active) controller.abort(new Error(translate('导出恢复所有权已失效')));
      })
      .catch((error: unknown) => controller.abort(error))
      .finally(() => { renewing = false; });
  }, 40_000);
  try {
    await writeUrlToDestination(context.destination, filename, path, controller.signal);
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function saveCompleted(
  context: ServerExportContext,
  format: ExportFormat,
  codec: ExportCodec,
  completed: ExportJobResult,
  renderId: string,
  claim: ServerExportDeliveryClaim,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  context.setBusy(context.t('正在保存…'));
  context.setProgress((current) => current ? {
    ...current,
    phase: 'downloading',
    percent: 99,
    detail: context.t('正在写入所选位置'),
  } : current);
  const renewed = await renewServerExportDelivery(renderId, claim);
  if (!renewed || !await checkServerExportDelivery(renderId, renewed)) {
    throw new ExportDestinationError('导出恢复所有权已失效，请重试');
  }
  signal?.throwIfAborted();
  const ext = exportMediaExtension(format, codec);
  const filename = completed.name ?? `${context.options.base}.${ext}`;
  const ambiguousDownload = context.destination.type === 'downloads';
  context.beginTargetCommit();
  let targetCommitted = false;
  try {
    if (ambiguousDownload) await markServerExportDeliveryAmbiguous(renderId, renewed);
    if (!await checkServerExportDelivery(renderId, renewed)) {
      throw new ExportDestinationError('导出恢复所有权已失效，请重试');
    }
    await writeCompletedWithLease(
      context,
      filename,
      completed.path!,
      renderId,
      renewed,
      signal,
    );
    if (ambiguousDownload) {
      context.endTargetCommit();
    } else {
      await markServerExportTargetCommitted(renderId, renewed);
      context.markTargetCommitted();
      targetCommitted = true;
    }
  } catch (error) {
    if (!targetCommitted) context.endTargetCommit();
    throw error;
  }
  context.setProgress((current) => current ? { ...current, outputSize: completed.sizeBytes } : current);
  const destinationId = exportHistoryDestinationId(context.destination);
  const historyName = exportDestinationFilename(context.destination, filename);
  void recordExport({
    name: historyName,
    format,
    codec,
    sizeBytes: completed.sizeBytes,
    createdAt: Date.now(),
    ...(destinationId ? { destinationId } : {}),
  });
  return targetCommitted;
}

function recordServerPerformance(context: ServerExportContext, completed: ExportJobResult, startedAt: number): void {
  if (!completed.encoder || !completed.width || !completed.height) return;
  recordExportPerformance(completed.encoder, {
    width: completed.width,
    height: completed.height,
    frames: Math.max(1, Math.round((completed.durationSeconds ?? 0) * (completed.fps ?? context.options.fps))),
    elapsedMs: performance.now() - startedAt,
  });
}

/**
 * Reelsmith (RS-301): optional .srt next to the delivered video (also for plain browser downloads, which never report a
 * committed target); a failure here never fails the export. Shared by the normal and the recovered/retried path.
 */
async function deliverSrtSidecar(
  context: ServerExportContext,
  format: ExportFormat,
  completed: ExportJobResult,
  codec: string,
  signal?: AbortSignal,
): Promise<void> {
  if (format !== 'video' || !isSupportedShape(context.options.state)) return;
  const pref = loadInstagramPreference();
  const sidecar = await writeSrtSidecar({
    enabled: pref.enabled && pref.srt, captions: context.options.subtitleCaptions, items: context.options.state.items,
    fps: context.options.state.fps, videoName: completed.name ?? `${context.options.base}.${exportMediaExtension(format, codec as ExportCodec)}`,
    write: (filename, blob) => writeBlobToDestination(context.destination, filename, blob, signal),
  });
  const last = instagramReportStore.get();
  if (sidecar.status !== 'skipped' || pref.srt) {
    instagramReportStore.set({
      ...(last ?? { status: 'skipped' as const }),
      srt: sidecar.status === 'written' ? `Captions saved as ${sidecar.name}.`
        : sidecar.status === 'failed' ? `Could not save the .srt: ${sidecar.message}` : `No .srt saved: ${sidecar.reason}.`,
    });
  }
  // RS-1232: a contact sheet of the rendered file (still on the server until the job is retired), kept for the agent
  if (!pref.enabled || !completed.path) return;
  const videoName = completed.name ?? `${context.options.base}.${exportMediaExtension(format, codec as ExportCodec)}`;
  const sheet = await deliverReviewSheet({
    state: context.options.state, src: completed.path, seconds: completed.durationSeconds ?? 0, videoName,
    checks: instagramReportStore.get()?.checks ?? [], save: pref.sheet,
    write: (filename, blob) => writeBlobToDestination(context.destination, filename, blob, signal),
  });
  const now = instagramReportStore.get();
  if (sheet.status !== 'kept') instagramReportStore.set({
    ...(now ?? { status: 'skipped' as const }),
    sheet: sheet.status === 'written' ? `Contact sheet saved as ${sheet.names!.join(', ')}.` : `No contact sheet: ${sheet.message}`,
  });
  // RS-1234: the cover for Instagram, from the same rendered file
  if (pref.cover) {
    const cover = await deliverCover({
      state: context.options.state, src: completed.path, seconds: completed.durationSeconds ?? 0, videoName,
      write: (filename, blob) => writeBlobToDestination(context.destination, filename, blob, signal),
    });
    instagramReportStore.set({
      ...(instagramReportStore.get() ?? { status: 'skipped' as const }),
      cover: cover.status === 'written' ? `Cover saved as ${cover.name} (at ${cover.pick.atSec.toFixed(1)} s${cover.pick.title ? `, titled "${cover.pick.title}"` : ''}).` : `No cover: ${cover.message}`,
    });
  }
  // RS-1241: a no-sound copy for adding the song from Instagram's licensed library, and where to start it
  if (pref.noSound && !pref.silent) {
    const copy = await deliverNoSoundCopy({
      state: context.options.state, src: completed.path, videoName,
      write: (filename, blob) => writeBlobToDestination(context.destination, filename, blob, signal),
    });
    if (copy.status !== 'none') instagramReportStore.set({
      ...(instagramReportStore.get() ?? { status: 'skipped' as const }),
      music: copy.status === 'written' ? `Saved ${copy.name}. ${copy.note}` : `No no-sound copy: ${copy.message}`,
    });
  }
}

async function exportMedia(
  context: ServerExportContext,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<ExportJobResult> {
  if (format === 'video') context.setRenderEngine('server');
  // Reelsmith RS-1238/1261: clips with a depth or sky effect carry their depth maps (the render page cannot ask for them).
  // The project too: when it is sent, the render takes the timeline from it and the state is not read.
  if (format === 'video') {
    const [state, project] = await Promise.all([withDepthMaps(context.options.state), context.options.project ? withDepthMaps(context.options.project) : undefined]);
    context = { ...context, options: { ...context.options, state, ...(project ? { project } : {}) } };
  }
  const codec = format === 'audio' ? 'mp3' : context.options.codec;
  const startedAt = performance.now();
  let { renderId, completed } = await renderCompleted(context, format, codec, signal);
  let targetCommitted = false;
  let claim: ServerExportDeliveryClaim | null = null;
  try {
    if (format === 'video') updateActualEngine(context, completed);
    signal?.throwIfAborted();
    // Reelsmith (RS-301): fix the render for Instagram before QA and delivery
    if (format === 'video') {
      const finalize = (c: ExportJobResult) => finalizeExportForInstagram(context.options.state, c, codec, signal, { setBusy: context.setBusy });
      await finalize(completed);
      // Reelsmith: a take that froze (V10) is rendered once more and the better take delivered
      ({ renderId, completed } = await retakeIfStalled({ renderId, completed }, {
        render: () => renderCompleted(context, format, codec, signal), finalize, retire: retireAndDeleteExportJob, setBusy: context.setBusy, signal,
      }));
    }
    if (format === 'video' && context.autoQaEnabled) {
      await context.verifyCompletedExport(completed, signal);
      signal?.throwIfAborted();
    }
    claim = await claimServerExportDelivery(renderId);
    if (!claim) throw new ExportDestinationError('此导出正在由另一个窗口恢复，请稍后重试');
    targetCommitted = await saveCompleted(context, format, codec, completed, renderId, claim, signal);
    if (format === 'video') recordServerPerformance(context, completed, startedAt);
    await deliverSrtSidecar(context, format, completed, codec, signal);
    return completed;
  } finally {
    if (claim) await releaseServerExportDelivery(renderId, claim).catch(() => undefined);
    if (targetCommitted) {
      await retireAndDeleteExportJob(renderId).catch(() => false);
    }
  }
}

export function createServerExporter(context: ServerExportContext) {
  return (format: ExportFormat, signal?: AbortSignal) => exportMedia(context, format, signal);
}

interface ResumePersistedServerExportsOptions {
  exportJobs: ExportJobStore;
  projectId: string;
  t: Translate;
}

const RESELECT_RECOVERY_DESTINATION = '导出目标授权已失效，请重新选择导出位置后重试';

function recoveredContext(
  record: PersistedServerExportJob,
  destination: ExportDestination,
  setters: BackgroundExportJobSetters,
  t: Translate,
): ServerExportContext {
  const options: UseExportWorkflowOptions = {
    state: record.state,
    projectName: 'Recovered export',
    projectId: record.projectId,
    base: record.base,
    tab: record.format,
    codec: record.codec === 'vp8' || record.codec === 'prores' ? record.codec : 'h264',
    resolution: '1080p',
    fps: record.fps,
    subtitleFormat: 'srt',
    subtitleCaptions: captionTrackEntries(record.state).find((entry) => entry.captions)?.captions ?? null,
    nleFormat: 'fcp_xml',
    includeMg: false,
    mgItems: [],
    onClose: () => undefined,
  };
  return {
    autoQaEnabled: record.autoQaEnabled,
    destination,
    options,
    targetPath: record.targetPath,
    t,
    verifyCompletedExport: createExportVerifier({
      fps: record.fps,
      state: record.state,
      t,
      ...setters,
    }),
    ...setters,
  };
}

async function runRecoveredServerExport(
  record: PersistedServerExportJob,
  setters: BackgroundExportJobSetters,
  signal: AbortSignal,
  t: Translate,
  initialClaim: ServerExportDeliveryClaim | null = null,
): Promise<void> {
  let claim = initialClaim;
  let targetCommitted = record.stage === 'target-committed';
  setters.setClock(Date.now());
  setters.setBusy(t('正在恢复导出…'));
  setters.setRenderEngine(record.format === 'video' ? 'server' : 'idle');
  try {
    if (targetCommitted) {
      setters.markTargetCommitted();
    } else {
      if (record.stage === 'delivery-ambiguous') {
        throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
      }
      if (!hasServerExportDestinationAuthority(record.destination)) {
        throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
      }
      const context = recoveredContext(record, record.destination, setters, t);
      const startedAt = performance.now();
      signal.throwIfAborted();
      await ensureExportDestinationWritable(record.destination).catch((error: unknown) => {
        if (record.destination.type === 'browser-directory' || record.destination.type === 'browser-file') {
          throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
        }
        throw error;
      });
      const completed = await pollExport(context, record.renderId, signal);
      if (record.stage === 'polling') await markServerExportOutputReady(record.renderId, claim ?? undefined);
      if (record.format === 'video') updateActualEngine(context, completed);
      signal.throwIfAborted();
      if (record.format === 'video') await finalizeExportForInstagram(record.state, completed, record.codec, signal, { setBusy: setters.setBusy });
      if (record.format === 'video' && record.autoQaEnabled) {
        await context.verifyCompletedExport(completed, signal);
        signal.throwIfAborted();
      }
      claim ??= await claimServerExportDelivery(record.renderId);
      if (!claim) throw new ExportDestinationError('此导出正在由另一个窗口恢复，请稍后重试');
      targetCommitted = await saveCompleted(
        context,
        record.format,
        record.codec,
        completed,
        record.renderId,
        claim,
        signal,
      );
      if (record.format === 'video') recordServerPerformance(context, completed, startedAt);
      await deliverSrtSidecar(context, record.format, completed, record.codec, signal); // RS-301: a retried export keeps its .srt too
    }
    const finishedAt = Date.now();
    setters.setClock(finishedAt);
    setters.setProgress((current) => current ? {
      ...current,
      phase: 'completed',
      percent: 100,
      finishedAt,
    } : current);
  } catch (reason) {
    const cancelled = isAbortError(reason);
    const existing = exportFailureFrom(reason);
    const message = exportDestinationErrorMessage(reason, t);
    const failure = existing ?? createExportFailure({
      stage: cancelled ? 'cancel' : reason instanceof ExportDestinationError ? 'destination' : 'render',
      code: cancelled ? 'export_cancelled'
        : reason instanceof ExportDestinationError ? 'export_destination_failed' : 'export_failed',
      retryable: !cancelled,
      targetPath: record.targetPath,
      message: cancelled ? t('已取消导出') : message,
    });
    setters.setFailure(failure);
    setters.setError(failure.message);
    setters.setProgress((current) => current ? {
      ...current,
      phase: cancelled ? 'cancelled' : 'failed',
      finishedAt: Date.now(),
    } : current);
  } finally {
    if (claim) await releaseServerExportDelivery(record.renderId, claim).catch(() => undefined);
    if (targetCommitted) {
      await retireAndDeleteExportJob(record.renderId).catch(() => false);
    }
    setters.setBusy(null);
  }
}

/** Reattach this editor to durable server renders accepted before a browser refresh. */
export async function resumePersistedServerExports({
  exportJobs,
  projectId,
  t,
}: ResumePersistedServerExportsOptions): Promise<void> {
  const records = await listServerExportJobs(projectId);
  for (const record of records) {
    exportJobs.recover({
      id: `server-export-${record.renderId}`,
      label: record.label,
      targetPath: record.targetPath,
      createdAt: record.createdAt,
      execute: ({ signal, setters }) => runRecoveredServerExport(record, setters, signal, t),
    });
  }
}

interface RebindPersistedServerExportOptions {
  destination: ExportDestination;
  exportJobs: ExportJobStore;
  renderId: string;
  t: Translate;
  targetPath: string;
}

export async function rebindAndResumePersistedServerExport({
  destination,
  exportJobs,
  renderId,
  t,
  targetPath,
}: RebindPersistedServerExportOptions): Promise<string> {
  const claim = await claimServerExportDelivery(renderId);
  if (!claim) throw new ExportDestinationError('此导出正在由另一个窗口恢复，请稍后重试');
  let rebound: PersistedServerExportJob;
  try {
    rebound = await rebindServerExportJob(renderId, destination, targetPath, claim);
  } catch (error) {
    await releaseServerExportDelivery(renderId, claim).catch(() => undefined);
    throw error;
  }
  return exportJobs.start({
    label: rebound.label,
    targetPath,
    execute: ({ signal, setters }) => runRecoveredServerExport(rebound, setters, signal, t, claim),
  });
}

export async function retirePersistedServerExport(renderId: string): Promise<boolean> {
  return retireAndDeleteExportJob(renderId);
}
