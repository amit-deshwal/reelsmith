// RS-304 fixtures and measurement: flash-and-beep clips (CFR, VFR, rotated, HLG) and a flash-to-beep offset meter.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Seconds at which a white flash starts and a 1 kHz beep starts (both on exact frame boundaries of 30 and 60 fps). */
export const FLASH_TIMES = [1, 2, 3];
const FLASH_LEN = 0.1;

export interface Fixture {
  id: 'cfr' | 'vfr' | 'rot' | 'hlg';
  path: string;
  durationSec: number;
  displayWidth: number;
  displayHeight: number;
  /** Luma (0-255) a mid-grey patch should have after a correct HDR to SDR conversion. */
  referenceLuma?: number;
}

const ff = (...args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });

const flashExpr = FLASH_TIMES.map((t) => `between(t,${t},${t + FLASH_LEN - 0.001})`).join('+');

function sources(w: number, h: number, rate: number, pix: string): string[] {
  // Dark grey background with a red marker in the top-left quarter; white flashes; a beep with each flash.
  const video = `color=c=0x303030:s=${w}x${h}:r=${rate}:d=4,drawbox=x=0:y=0:w=iw/4:h=ih/4:color=red:t=fill,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='${flashExpr}',format=${pix}`;
  const audio = `aevalsrc='0.8*sin(2*PI*1000*t)*(${flashExpr})':s=48000:d=4`;
  return ['-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio];
}

export function makeFixtures(dir: string): Fixture[] {
  mkdirSync(dir, { recursive: true });
  const out: Fixture[] = [];
  const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k'];

  const cfr = join(dir, 'cfr.mp4');
  ff(...sources(1080, 1920, 30, 'yuv420p'), ...enc, '-pix_fmt', 'yuv420p', cfr);
  out.push({ id: 'cfr', path: cfr, durationSec: 4, displayWidth: 1080, displayHeight: 1920 });

  // Variable frame rate: a 60 fps source with frames dropped (the flashes are kept) and timestamps left as they were.
  const vfr = join(dir, 'vfr.mp4');
  const keepFlash = FLASH_TIMES.map((t) => `between(t,${t - 0.05},${t + FLASH_LEN + 0.05})`).join('+');
  const src = sources(1080, 1920, 60, 'yuv420p');
  src[3] = src[3]!.replace(',format=yuv420p', `,select='lt(mod(n,7),3)+${keepFlash}',format=yuv420p`);
  ff(...src, ...enc, '-fps_mode', 'vfr', '-pix_fmt', 'yuv420p', vfr);
  out.push({ id: 'vfr', path: vfr, durationSec: 4, displayWidth: 1080, displayHeight: 1920 });

  // Rotation: coded 1920x1080 landscape pixels with a 90 degree display rotation, so it plays as 1080x1920 portrait.
  const landscape = join(dir, 'landscape.mp4');
  ff(...sources(1920, 1080, 30, 'yuv420p'), ...enc, '-pix_fmt', 'yuv420p', landscape);
  const rot = join(dir, 'rot.mp4');
  ff('-display_rotation', '90', '-i', landscape, '-c', 'copy', rot);
  out.push({ id: 'rot', path: rot, durationSec: 4, displayWidth: 1080, displayHeight: 1920 });

  // HLG: 10-bit HEVC tagged BT.2020 / ARIB STD-B67, the way an iPhone records HDR.
  const hlg = join(dir, 'hlg.mp4');
  const x265 = 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited:log-level=error';
  ff(...sources(1080, 1920, 30, 'yuv420p10le'), '-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-x265-params', x265, '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '192k', hlg);
  out.push({ id: 'hlg', path: hlg, durationSec: 4, displayWidth: 1080, displayHeight: 1920 });
  return out;
}

interface Measure {
  /** audio onset minus video onset for each expected flash, in ms */
  offsetsMs: number[];
  size: string;
  /** mean luma (0-255) of the background in the middle of the frame, away from the flashes */
  greyLuma: number;
  /** which quarter of the frame holds the red marker: 'top-left' when upright */
  markerQuadrant: string;
}

const out = (cmd: string, args: string[]) => execFileSync(cmd, args, { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }).toString() + '';

/** Luma per decoded frame (pts_time, mean Y) for the first video stream. */
function frameLuma(path: string): Array<{ t: number; y: number }> {
  const res = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-an', '-vf', 'scale=96:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { maxBuffer: 1 << 28 }).toString();
  const rows: Array<{ t: number; y: number }> = [];
  let t = NaN;
  for (const line of res.split('\n')) {
    const a = /pts_time:([0-9.]+)/.exec(line);
    if (a) t = Number(a[1]);
    const b = /YAVG=([0-9.]+)/.exec(line);
    if (b) rows.push({ t, y: Number(b[1]) });
  }
  return rows;
}

/** Loudness per millisecond (RMS dB) of the first audio stream, 48 samples at a time. */
function beepOnsets(path: string): number[] {
  const res = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '48000', '-af', 'asetnsamples=n=48:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'], { maxBuffer: 1 << 28 }).toString();
  const rows: Array<{ t: number; db: number }> = [];
  let t = NaN;
  for (const line of res.split('\n')) {
    const a = /pts_time:([0-9.]+)/.exec(line);
    if (a) t = Number(a[1]);
    const b = /RMS_level=(-?[0-9.]+|-inf)/.exec(line);
    if (b) rows.push({ t, db: b[1] === '-inf' ? -200 : Number(b[1]) });
  }
  const onsets: number[] = [];
  let loud = false;
  for (const r of rows) {
    if (r.db > -30 && !loud) { onsets.push(r.t); loud = true; } else if (r.db < -50) loud = false;
  }
  return onsets;
}

export function measureOffsets(path: string, expected: number[]): Measure {
  const luma = frameLuma(path);
  const flashOnsets: number[] = [];
  let lit = false;
  for (const f of luma) {
    if (f.y > 128 && !lit) { flashOnsets.push(f.t); lit = true; } else if (f.y < 100) lit = false;
  }
  const beeps = beepOnsets(path);
  const offsetsMs = expected.map((e) => {
    const v = flashOnsets.find((t) => Math.abs(t - e) < 0.2);
    const a = beeps.find((t) => Math.abs(t - e) < 0.2);
    return v === undefined || a === undefined ? NaN : (a - v) * 1000;
  });
  const size = out('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]).trim();
  // Background luma and marker position from one dark frame (t = 0.5 s), at 4x4 resolution.
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', path, '-frames:v', '1', '-vf', 'scale=4:4:flags=area,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  const px = (x: number, y: number) => [raw[(y * 4 + x) * 3]!, raw[(y * 4 + x) * 3 + 1]!, raw[(y * 4 + x) * 3 + 2]!] as const;
  const redness = (x: number, y: number) => px(x, y)[0] - px(x, y)[2];
  let best = { x: 0, y: 0, v: -999 };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (redness(x, y) > best.v) best = { x, y, v: redness(x, y) };
  const markerQuadrant = `${best.y < 2 ? 'top' : 'bottom'}-${best.x < 2 ? 'left' : 'right'}`;
  const [r, g, b] = px(2, 2);
  const greyLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { offsetsMs, size, greyLuma, markerQuadrant };
}
