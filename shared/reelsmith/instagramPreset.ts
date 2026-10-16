// RS-301: the "Instagram Reel" export presets. RS-904: the size follows the project's shape (any supported ratio).
import { ratioOf } from './ratios';
export interface ReelPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: 'h264';
  profile: 'high';
  level: string;
  audioCodec: 'aac';
  sampleRate: 48000;
  channels: 2;
  audioBitrateK: number;
  faststart: true;
  colorSpace: 'bt709';
  pixFmt: 'yuv420p';
  /** integrated loudness target; null = no audio track (add Instagram audio later) */
  lufs: number | null;
  truePeakDb: number;
  /** write a .srt next to the video */
  srtSidecar: boolean;
}

const base: Omit<ReelPreset, 'id' | 'label' | 'fps' | 'level'> = {
  width: 1080, height: 1920, videoCodec: 'h264', profile: 'high', audioCodec: 'aac', sampleRate: 48000, channels: 2,
  audioBitrateK: 256, faststart: true, colorSpace: 'bt709', pixFmt: 'yuv420p', lufs: -14, truePeakDb: -1, srtSidecar: false,
};

export const REEL_PRESETS: Record<string, ReelPreset> = {
  'instagram-reel': { ...base, id: 'instagram-reel', label: 'Instagram Reel (1080×1920, 30 fps)', fps: 30, level: '4.0' },
  'instagram-reel-60': { ...base, id: 'instagram-reel-60', label: 'Instagram Reel (1080×1920, 60 fps)', fps: 60, level: '4.2' },
  'instagram-reel-silent': { ...base, id: 'instagram-reel-silent', label: 'Instagram Reel, no music (add audio in Instagram)', fps: 30, level: '4.0', lufs: null },
};

export function withSrt(p: ReelPreset, on: boolean): ReelPreset {
  return { ...p, srtSidecar: on };
}

/** The preset at the project's own size, when that is one of the supported shapes (otherwise null). */
export function presetForCanvas(p: ReelPreset, width: number, height: number): ReelPreset | null {
  const ratio = ratioOf(width, height);
  if (!ratio) return null;
  if (ratio === '9:16') return p;
  return { ...p, width, height, label: p.label.replace('Instagram Reel', `Instagram ${ratio}`).replace('1080×1920', `${width}×${height}`) };
}
