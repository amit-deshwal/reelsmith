import { materializeTimelineExport } from '../export/materializeBlobMedia';
import type { ProjectDoc, TimelineState } from '../editor/types';
import { scaledExportDimensions } from '../export/mediaSettings';

export interface SubmitMediaExportArgs {
  format: 'video' | 'audio';
  codec?: 'h264' | 'vp8' | 'mp3' | 'wav';
  name?: string;
  startFrame?: number;
  endFrameExclusive?: number;
  startSeconds?: number;
  endSeconds?: number;
  /** Output fps; the server retimes (drops or repeats frames), so the duration is kept. */
  fps?: number;
  /** Target size of the shorter side (a 9:16 reel at 1080p is 1080x1920): 480p | 720p | 1080p. */
  resolution?: '480p' | '720p' | '1080p';
  /** Exact video bitrate in bits per second. */
  videoBitrate?: number;
}

export interface MediaExportResult {
  status: 'completed';
  format: 'video' | 'audio';
  codec: 'h264' | 'vp8' | 'mp3' | 'wav';
  name: string;
  sizeBytes: number;
  startFrame?: number;
  endFrameExclusive?: number;
  startSeconds?: number;
  endSeconds?: number;
  fps?: number;
  resolution?: string;
  width?: number;
  height?: number;
}

/**
 * Reelsmith (RS-1251 follow-up): the output size and frame rate, without touching the timeline. The server's /export
 * scales the render by the shorter side and retimes the fps itself; rewriting the canvas here made a 9:16 reel at
 * "1080p" come out 608x1080 (the height was set to 1080) and laid out on a smaller canvas, and overriding the timeline's
 * fps kept its frame counts, so a 60 fps reel exported "at 30" played at half speed.
 */
export function exportOutputGeometry(
  state: Pick<TimelineState, 'width' | 'height' | 'fps'>,
  opts: { fps?: number; resolution?: SubmitMediaExportArgs['resolution'] },
): { width: number; height: number; fps: number } {
  const size = scaledExportDimensions(state, opts.resolution);
  const fps = typeof opts.fps === 'number' && [24, 25, 30, 50, 60].includes(opts.fps) ? opts.fps : state.fps;
  return { width: size.width, height: size.height, fps };
}

export async function submitMediaExport(
  args: SubmitMediaExportArgs,
  project: ProjectDoc,
  timelineId: string,
): Promise<MediaExportResult> {
  const codec = args.codec ?? (args.format === 'video' ? 'h264' : 'mp3');
  const ext = codec === 'h264' ? 'mp4' : codec === 'vp8' ? 'webm' : codec;
  const selected = project.timelines.find((timeline) => timeline.id === timelineId);
  if (!selected) throw new Error(`timeline not found: ${timelineId}`);
  const video = args.format === 'video';
  const geometry = exportOutputGeometry(selected, video ? { fps: args.fps, resolution: args.resolution } : {});
  const snapshot = await materializeTimelineExport(project, timelineId);
  const exportState = snapshot.state;
  const response = await fetch('/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: exportState,
      project: snapshot.project,
      timelineId: snapshot.timelineId,
      format: args.format,
      codec: args.codec,
      name: args.name,
      startFrame: args.startFrame,
      endFrameExclusive: args.endFrameExclusive,
      startSeconds: args.startSeconds,
      endSeconds: args.endSeconds,
      videoBitrate: video ? args.videoBitrate : undefined,
      resolution: video ? args.resolution : undefined,
      fps: video && geometry.fps !== selected.fps ? geometry.fps : undefined,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? `media export failed (${response.status})`);
  }
  const blob = await response.blob();
  // The client already has the correct UTF-8 name, and it can be used directly as anchor.download (anchor uses JS strings,
  // Chinese security); no longer parse the Content-Disposition header of the server (headers.get will be garbled according to ISO-8859-1).
  const base = (args.name ?? 'export').replace(/\.(?:mp4|webm|mp3|wav)$/i, '');
  const name = `${base}.${ext}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delayed revoke: revoking synchronously after click() can cut the download
  // off before the browser starts reading the blob (same pattern as exportFiles.ts).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {
    status: 'completed',
    format: args.format,
    codec,
    name,
    sizeBytes: blob.size,
    startFrame: args.startFrame,
    endFrameExclusive: args.endFrameExclusive,
    startSeconds: args.startSeconds,
    endSeconds: args.endSeconds,
    fps: geometry.fps,
    resolution: args.resolution,
    width: geometry.width,
    height: geometry.height,
  };
}
