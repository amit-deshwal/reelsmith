// RS-1250: the frame rate of imported clips, so the Director can build at the footage's rate (iPhone 4K60) instead of
// the editor's default 30. Read from the imported copy, which keeps the source rate.
import { execFile } from 'node:child_process';
import { ffprobeBin } from '../media-binaries.ts';

/** "60/1", "30000/1001" → frames per second; null for missing or nonsense values. */
export function parseRate(rate: unknown): number | null {
  if (typeof rate !== 'string') return null;
  const [n, d = '1'] = rate.split('/');
  const fps = Number(n) / Number(d);
  return Number.isFinite(fps) && fps > 0 && fps <= 240 ? Math.round(fps * 1000) / 1000 : null;
}

export function readFrameRate(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(ffprobeBin(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'json', file],
      { timeout: 10_000, maxBuffer: 256 * 1024 }, (error, stdout) => {
        if (error) { resolve(null); return; }
        try {
          const stream = (JSON.parse(stdout) as { streams?: Array<{ avg_frame_rate?: string; r_frame_rate?: string }> }).streams?.[0];
          resolve(parseRate(stream?.avg_frame_rate) ?? parseRate(stream?.r_frame_rate));
        } catch { resolve(null); }
      });
  });
}
