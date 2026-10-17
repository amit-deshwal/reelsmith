// RS-107 "Preview with my footage": render a few seconds of an assembled (not yet applied) recipe at small size.
// Uses the app's own export pipeline, then scales to a 360x640 muted loop in the media folder.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { uploadDir } from '../media-dir.ts';
import { acceptExportSubmission } from '../plugins/export-submission.ts';
import { h264RenderOptions, renderTimeline } from '../plugins/export-rendering.ts';
import { withExportPermit } from '../plugins/export-runtime.ts';

const run = promisify(execFile);

export interface PreviewRequest {
  project: { activeTimelineId: string; timelines: Array<{ id: string; fps: number; items: Array<{ startFrame: number; durationInFrames: number }> }>; assets?: unknown[] };
  /** seconds; clamped to 3..6 */
  seconds?: number;
}

export async function renderRecipePreview(req: PreviewRequest): Promise<{ src: string; ms: number }> {
  const started = Date.now();
  const doc = req.project;
  const tl = doc.timelines.find((t) => t.id === doc.activeTimelineId);
  if (!tl || !tl.items.length) throw new Error('nothing to preview');
  const end = Math.max(...tl.items.map((i) => i.startFrame + i.durationInFrames));
  const seconds = Math.max(3, Math.min(6, Number(req.seconds) || 5));
  const submission = await acceptExportSubmission({
    state: { ...tl, assets: doc.assets ?? [] }, project: doc, timelineId: tl.id, format: 'video', codec: 'h264', resolution: '480p',
    startFrame: 0, endFrameExclusive: Math.min(end, Math.round(seconds * tl.fps)),
  });
  const plan = submission.plan;
  const dir = uploadDir();
  // previews are throwaway: drop ones older than 15 minutes
  for (const f of (await readdir(dir).catch(() => [] as string[])).filter((n) => n.startsWith('rs-preview-'))) {
    const p = join(dir, f);
    if (Date.now() - (await stat(p).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 15 * 60_000) await unlink(p).catch(() => {});
  }
  const raw = join(dir, `rs-preview-${randomUUID()}.raw.mp4`);
  const name = `rs-preview-${randomUUID()}.mp4`;
  try {
    const opts = await h264RenderOptions(plan.media.codec, { preferSpeed: true });
    await withExportPermit(() => renderTimeline({
      state: plan.state, project: plan.project, timelineId: plan.timelineId, outputLocation: raw,
      codec: plan.media.codec, frameRange: plan.frameRange, scale: plan.scale, videoBitrate: plan.videoBitrate, ...opts,
    }));
    await run('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-an', '-vf', 'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, name)]);
  } finally {
    await submission.cleanup();
    await unlink(raw).catch(() => {});
  }
  return { src: `/media/uploads/${name}`, ms: Date.now() - started };
}
