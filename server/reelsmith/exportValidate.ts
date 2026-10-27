// RS-302: automatic export validation (spec §12.7, V1-V9 minus the preview-parity sample, V8, which needs the renderer),
// and V10, frozen or stuttering picture (RS-1231).
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
  /** intended still stretches in seconds [start,end] (a freeze frame, a photo with no move) */
  intendedHolds?: Array<[number, number]>;
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
      else if (I < -60) add('V6', 'PASS', 'silent audio track (nothing to normalise)');
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

  // V10 frozen and stuttering picture (RS-1231)
  if (!opts.quick) checks.push(await frameRepeatCheck(file, p.fps, vdur, opts.intendedHolds ?? []));

  // V9 size and bitrate
  const size = (await stat(file)).size;
  const kbps = (size * 8) / Math.max(0.1, vdur) / 1000;
  add('V9', size > 4 * 1024 ** 3 || kbps < 1000 ? 'WARN' : 'PASS', `${(size / 1e6).toFixed(1)} MB, ${Math.round(kbps)} kbps`);

  return { ok: !checks.some((c) => c.status === 'FAIL'), checks };
}

const overlaps = (a: [number, number], spans: ReadonlyArray<[number, number]>) => spans.some(([s, e]) => a[0] >= s - 0.1 && a[1] <= e + 0.1);

/**
 * RS-1231: what a stalled render leaves in the file. `ydif` is each frame's luma difference from the one before (an
 * exact repeat decodes as 0), `freezes` ffmpeg's freezedetect spans. A freeze is a still stretch nobody placed; a
 * stutter is a burst of single repeated frames (at least three within a second) at uneven gaps. Even gaps are a
 * 24 or 25 fps clip played in a 30 fps reel (`cadence`), which is how that clip looks anywhere.
 */
export function repeatedFrames(ydif: readonly number[], freezes: ReadonlyArray<[number, number]>, fps: number, holds: ReadonlyArray<[number, number]> = []) {
  const frozen = freezes.filter((f) => !overlaps(f, holds));
  const inFreeze = (i: number) => freezes.some(([s, e]) => i / fps >= s - 1 / fps && i / fps <= e);
  const reps = ydif.flatMap((d, i) => (i > 0 && d === 0 && !inFreeze(i) && !(ydif[i - 1] === 0 && ydif[i + 1] === 0) ? [i] : []));
  // bursts: repeats no more than a second apart
  const bursts: number[][] = [];
  for (const i of reps) {
    const last = bursts.at(-1);
    if (last && i - last.at(-1)! <= fps) last.push(i);
    else bursts.push([i]);
  }
  let cadence = false;
  const stutters: Array<[number, number]> = [];
  for (const b of bursts) {
    const dense = b.some((_, k) => k >= 2 && b[k]! - b[k - 2]! < fps);
    if (!dense) continue;
    const gaps = b.slice(1).map((x, k) => x - b[k]!);
    if (gaps.length >= 3 && Math.max(...gaps) - Math.min(...gaps) <= 1) { cadence = true; continue; }
    const span: [number, number] = [b[0]! / fps, b.at(-1)! / fps];
    if (!overlaps(span, holds)) stutters.push(span);
  }
  return { freezes: frozen, stutters, cadence };
}

/** V10 on a file: one ffmpeg pass for freezedetect and each frame's difference from the one before. */
export async function frameRepeatCheck(file: string, fps: number, seconds: number, holds: ReadonlyArray<[number, number]> = []): Promise<Check> {
  const fr = await run('ffmpeg', ['-nostats', '-i', file, '-vf', 'freezedetect=n=0.001:d=0.4,signalstats,metadata=print:key=lavfi.signalstats.YDIF', '-an', '-f', 'null', '-'], BIG)
    .catch((e) => ({ stderr: String(e.stderr ?? '') }));
  const out = String((fr as { stderr?: string }).stderr);
  const ydif = [...out.matchAll(/lavfi\.signalstats\.YDIF=([\d.]+)/g)].map((m) => Number(m[1]));
  const starts = [...out.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const f = repeatedFrames(ydif, starts.map((s, i) => [s, ends[i] ?? seconds]), fps, holds);
  const spans = (xs: Array<[number, number]>) => xs.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)}s`).join(', ');
  const parts = [...(f.freezes.length ? [`frozen at ${spans(f.freezes)}`] : []), ...(f.stutters.length ? [`stutters (repeated frames) at ${spans(f.stutters)}`] : [])];
  return parts.length
    ? { id: 'V10', status: 'WARN', detail: `${parts.join('; ')}; if the preview plays smoothly there, restart the app and export again` }
    : { id: 'V10', status: 'PASS', detail: `no frozen or stuttering picture${f.cadence ? ' (a lower frame-rate clip repeats frames evenly, as expected)' : ''}` };
}

export function formatReport(r: ValidationReport): string {
  return r.checks.map((c) => `${c.status.padEnd(4)} ${c.id}  ${c.detail}`).join('\n');
}
