// RS-302: automatic export validation (spec §12.7, V1-V9 minus the preview-parity sample, V8, which needs the renderer).
import { execFile } from 'node:child_process';
import { open, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ReelPreset } from '../../shared/reelsmith/instagramPreset.ts';

const run = promisify(execFile);
const BIG = { maxBuffer: 64 * 1024 * 1024 };

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';
export interface Check { id: string; status: CheckStatus; detail: string }
export interface ValidationReport { ok: boolean; checks: Check[] }

export interface ValidateOptions {
  preset: ReelPreset;
  /** expected frames; default derives from the video duration */
  expectedFrames?: number;
  /** intended black segments in seconds [start,end] (dip to black etc.) */
  intendedBlack?: Array<[number, number]>;
  /** skip the slow loudness / black passes */
  quick?: boolean;
}

/** Offsets of top-level MP4 boxes, enough to tell whether moov precedes mdat. */
export async function topLevelBoxes(file: string): Promise<Array<{ type: string; offset: number }>> {
  const fh = await open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    const out: Array<{ type: string; offset: number }> = [];
    let pos = 0;
    const head = Buffer.alloc(16);
    while (pos + 8 <= size) {
      await fh.read(head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (len === 1) len = Number(head.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      out.push({ type, offset: pos });
      if (len < 8) break;
      pos += len;
    }
    return out;
  } finally {
    await fh.close();
  }
}

const num = (v: unknown) => (v === undefined || v === 'N/A' ? NaN : Number(v));
const frac = (v: string | undefined) => {
  if (!v) return NaN;
  const [a, b] = v.split('/').map(Number);
  return b ? a! / b : a!;
};

export async function validateReel(file: string, opts: ValidateOptions): Promise<ValidationReport> {
  const p = opts.preset;
  const checks: Check[] = [];
  const add = (id: string, status: CheckStatus, detail: string) => checks.push({ id, status, detail });

  // V1 container + faststart
  const boxes = await topLevelBoxes(file).catch(() => []);
  const moov = boxes.find((b) => b.type === 'moov');
  const mdat = boxes.find((b) => b.type === 'mdat');
  if (!boxes.some((b) => b.type === 'ftyp') || !moov || !mdat) add('V1', 'FAIL', 'not a valid MP4 (missing ftyp/moov/mdat)');
  else if (moov.offset > mdat.offset) add('V1', 'FAIL', 'moov is after mdat (not faststart)');
  else add('V1', 'PASS', 'mp4, faststart');

  const probe = JSON.parse((await run('ffprobe', [
    '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file,
  ], BIG).catch(() => ({ stdout: '{}' }))).stdout) as {
    streams?: Array<Record<string, string>>; format?: Record<string, string>;
  };
  const v = probe.streams?.find((s) => s.codec_type === 'video');
  const a = probe.streams?.find((s) => s.codec_type === 'audio');
  if (!v) {
    add('V2', 'FAIL', 'no video stream');
    return { ok: false, checks };
  }

  // V2 video
  const problems: string[] = [];
  if (v.codec_name !== 'h264') problems.push(`codec ${v.codec_name}`);
  if (v.profile !== 'High') problems.push(`profile ${v.profile}`);
  if (Number(v.width) !== p.width || Number(v.height) !== p.height) problems.push(`size ${v.width}x${v.height}`);
  if (v.pix_fmt !== p.pixFmt) problems.push(`pix_fmt ${v.pix_fmt}`);
  const cs = v.color_space;
  if (cs && cs !== 'bt709') problems.push(`color_space ${cs}`);
  const rfr = frac(v.r_frame_rate); const afr = frac(v.avg_frame_rate);
  if (Math.abs(rfr - p.fps) > 0.01 || Math.abs(afr - p.fps) > 0.01) problems.push(`fps r=${rfr.toFixed(3)} avg=${afr.toFixed(3)} (want ${p.fps} CFR)`);
  const frames = num(v.nb_read_frames);
  const vdur = num(v.duration) || num(probe.format?.duration);
  const expected = opts.expectedFrames ?? Math.round(vdur * p.fps);
  if (Math.abs(frames - expected) > 0) problems.push(`frames ${frames} (expected ${expected})`);
  if (!cs) add('V2', problems.length ? 'FAIL' : 'WARN', problems.length ? problems.join('; ') : 'ok, but colour tags (bt709) are missing');
  else add('V2', problems.length ? 'FAIL' : 'PASS', problems.join('; ') || `h264 High ${v.width}x${v.height} ${p.fps} fps CFR, ${frames} frames`);

  // V3 audio
  if (p.lufs === null) {
    add('V3', a ? 'WARN' : 'PASS', a ? 'preset is silent but the file has audio' : 'no audio, as requested');
  } else if (!a) add('V3', 'FAIL', 'no audio track');
  else {
    const ap: string[] = [];
    if (a.codec_name !== 'aac') ap.push(`codec ${a.codec_name}`);
    if (Number(a.sample_rate) !== p.sampleRate) ap.push(`rate ${a.sample_rate}`);
    if (Number(a.channels) !== p.channels) ap.push(`channels ${a.channels}`);
    add('V3', ap.length ? 'FAIL' : 'PASS', ap.join('; ') || 'aac 48 kHz stereo');
  }

  // V4 durations and start offsets
  const frameDur = 1 / p.fps;
  if (a) {
    const adur = num(a.duration);
    const dv = Math.abs(vdur - frames * frameDur);
    const da = Math.abs(adur - vdur);
    const st = Math.max(Math.abs(num(v.start_time) || 0), Math.abs(num(a.start_time) || 0));
    const bad = dv > frameDur + 1e-6 || da > 0.0214 || st > 0.001 + 0.05; // priming delay is hidden by the edit list
    add('V4', bad ? 'FAIL' : 'PASS', `video ${vdur.toFixed(3)}s, audio ${adur.toFixed(3)}s, drift ${(da * 1000).toFixed(1)} ms`);
  } else add('V4', Math.abs(vdur - frames * frameDur) > frameDur + 1e-6 ? 'FAIL' : 'PASS', `video ${vdur.toFixed(3)}s`);

  // V5 full decode
  const dec = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], BIG).catch((e) => ({ stderr: String(e.stderr ?? e) }));
  const decErr = String((dec as { stderr?: string }).stderr ?? '').trim();
  add('V5', decErr ? 'FAIL' : 'PASS', decErr ? decErr.split('\n')[0]!.slice(0, 160) : 'decodes cleanly');

  if (!opts.quick) {
    // V6 loudness
    if (a && p.lufs !== null) {
      const r = await run('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'], BIG).catch((e) => ({ stderr: String(e.stderr ?? '') }));
      const txt = String((r as { stderr?: string }).stderr);
      const sum = txt.slice(txt.lastIndexOf('Summary:'));
      const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
      const tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1]);
      if (!Number.isFinite(I)) add('V6', 'WARN', 'could not measure loudness');
      else {
        const bad = Math.abs(I - p.lufs) > 1 || (Number.isFinite(tp) && tp > p.truePeakDb + 0.05);
        add('V6', bad ? 'FAIL' : 'PASS', `${I.toFixed(1)} LUFS, true peak ${Number.isFinite(tp) ? tp.toFixed(1) : '?'} dBTP`);
      }
    }
    // V7 unintended black
    const bl = await run('ffmpeg', ['-nostats', '-i', file, '-vf', 'blackdetect=d=0.2:pix_th=0.1', '-an', '-f', 'null', '-'], BIG).catch((e) => ({ stderr: String(e.stderr ?? '') }));
    const segs = [...String((bl as { stderr?: string }).stderr).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    const stray = segs.filter(([s, e]) => !(opts.intendedBlack ?? []).some(([is, ie]) => s >= is - 0.1 && e <= ie + 0.1));
    add('V7', stray.length ? 'WARN' : 'PASS', stray.length ? `unexpected black at ${stray.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)}s`).join(', ')}` : 'no unintended black frames');
  }

  // V9 size and bitrate
  const size = (await stat(file)).size;
  const kbps = (size * 8) / Math.max(0.1, vdur) / 1000;
  add('V9', size > 4 * 1024 ** 3 || kbps < 1000 ? 'WARN' : 'PASS', `${(size / 1e6).toFixed(1)} MB, ${Math.round(kbps)} kbps`);

  return { ok: !checks.some((c) => c.status === 'FAIL'), checks };
}

export function formatReport(r: ValidationReport): string {
  return r.checks.map((c) => `${c.status.padEnd(4)} ${c.id}  ${c.detail}`).join('\n');
}
