// RS-301: optional .srt sidecar written next to an Instagram-ready export (Instagram can import it as captions).
import { captionsToSrt } from '../captions/exportCaptions';
import type { CaptionsData } from '../captions/types';
import type { TimelineItem } from '../editor/types';

export function srtSidecarName(videoName: string): string {
  return `${videoName.replace(/\.[^./\\]+$/, '')}.srt`;
}

export type SrtSidecarResult =
  | { status: 'written'; name: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; message: string };

/** Writes the sidecar through `write`; never throws, because the video is already delivered by now. */
export async function writeSrtSidecar(opts: {
  enabled: boolean;
  captions: CaptionsData | null;
  items: TimelineItem[];
  fps: number;
  videoName: string;
  write: (filename: string, blob: Blob) => Promise<void>;
}): Promise<SrtSidecarResult> {
  if (!opts.enabled) return { status: 'skipped', reason: 'off' };
  if (!opts.captions) return { status: 'skipped', reason: 'no captions on the timeline' };
  const text = captionsToSrt(opts.captions, opts.items, opts.fps);
  if (!text) return { status: 'skipped', reason: 'the caption track is empty' };
  const name = srtSidecarName(opts.videoName);
  try {
    await opts.write(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
    return { status: 'written', name };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
