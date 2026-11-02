// Local tempo/beat/drop detection with ffmpeg only (no model download, no network).
// Onset envelope -> tempo by autocorrelation -> beat phase by comb scoring. Good for steady pop/dance music;
// the beat-grid UI (RS-601) lets the user correct it by hand.
import { spawn } from 'node:child_process';
import { ffmpegBin } from '../media-binaries.ts';

const SR = 11025;
const HOP = 256; // ~23 ms frames

export function decodeMono(file: string, maxSec = 300): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegBin(), ['-v', 'error', '-t', String(maxSec), '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']);
    const chunks: Buffer[] = [];
    let err = '';
    ff.stdout.on('data', (d: Buffer) => chunks.push(d));
    ff.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${err.slice(-200)}`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice());
    });
  });
}

/** RMS energy per hop. */
export function energyEnvelope(pcm: Float32Array): Float32Array {
  const n = Math.floor(pcm.length / HOP);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j += 1) s += pcm[j]! * pcm[j]!;
    out[i] = Math.sqrt(s / HOP);
  }
  return out;
}

/** Positive first difference of the (log-compressed) envelope = onset strength. */
export function onsetStrength(env: Float32Array): Float32Array {
  const out = new Float32Array(env.length);
  for (let i = 1; i < env.length; i += 1) {
    const d = Math.log1p(env[i]! * 50) - Math.log1p(env[i - 1]! * 50);
    out[i] = d > 0 ? d : 0;
  }
  return out;
}

const frameSec = HOP / SR;

export function estimateBpm(onset: Float32Array, minBpm = 70, maxBpm = 180): number | null {
  const minLag = Math.floor(60 / maxBpm / frameSec);
  const maxLag = Math.ceil(60 / minBpm / frameSec);
  if (onset.length < maxLag * 4) return null;
  let best = -1; let bestScore = 0;
  const score = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let s = 0;
    for (let i = lag; i < onset.length; i += 1) s += onset[i]! * onset[i - lag]!;
    // mild preference for 100-140 bpm
    const bpm = 60 / (lag * frameSec);
    s *= 1 - Math.min(0.25, Math.abs(Math.log2(bpm / 120)) * 0.25);
    score[lag] = s;
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  if (best < 0 || bestScore <= 0) return null;
  // parabolic interpolation for sub-frame lag
  const a = score[best - 1] ?? score[best]!; const b = score[best]!; const c = score[best + 1] ?? score[best]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return 60 / ((best + shift) * frameSec);
}

/** Phase (seconds into the audio of the first beat) maximising onset energy on the comb. */
export function estimatePhase(onset: Float32Array, bpm: number): number {
  const period = 60 / bpm / frameSec; // frames
  let best = 0; let bestScore = -1;
  for (let off = 0; off < period; off += 0.5) {
    let s = 0;
    for (let t = off; t < onset.length - 1; t += period) {
      const i = Math.round(t);
      s += onset[i]! + 0.5 * (onset[i - 1] ?? 0) + 0.5 * (onset[i + 1] ?? 0);
    }
    if (s > bestScore) { bestScore = s; best = off; }
  }
  return best * frameSec;
}

export interface BeatAnalysis {
  bpm: number;
  beatTimesSec: number[];
  beatsPerBar: 4;
  downbeatIndex: number;
  durationSec: number;
  /** mean energy per beat, for drop detection */
  energyPerBeat: number[];
  loudestStartSec: number;
}

export function analyzeBeats(pcm: Float32Array): BeatAnalysis | null {
  const env = energyEnvelope(pcm);
  const onset = onsetStrength(env);
  const bpm = estimateBpm(onset);
  if (!bpm) return null;
  const durationSec = pcm.length / SR;
  const step = 60 / bpm;
  const first = estimatePhase(onset, bpm);
  const beats: number[] = [];
  for (let t = first; t < durationSec - step / 2; t += step) beats.push(t);
  const energyPerBeat = beats.map((t) => {
    const a = Math.floor(t / frameSec); const b = Math.max(a + 1, Math.floor((t + step) / frameSec));
    let s = 0;
    for (let i = a; i < b && i < env.length; i += 1) s += env[i]!;
    return s / (b - a);
  });
  // downbeat: the beat offset (0..3) whose beats carry the most energy on average
  let downbeatIndex = 0; let bestE = -1;
  for (let k = 0; k < 4; k += 1) {
    let s = 0; let n = 0;
    for (let i = k; i < energyPerBeat.length; i += 4) { s += energyPerBeat[i]!; n += 1; }
    if (n && s / n > bestE) { bestE = s / n; downbeatIndex = k; }
  }
  // loudest 8-bar section start, snapped to a downbeat
  const win = Math.max(4, Math.min(32, Math.floor(energyPerBeat.length / 2)));
  let loudIdx = downbeatIndex; let loudE = -1;
  for (let i = downbeatIndex; i + win <= energyPerBeat.length; i += 4) {
    let s = 0;
    for (let j = i; j < i + win; j += 1) s += energyPerBeat[j]!;
    if (s > loudE) { loudE = s; loudIdx = i; }
  }
  return { bpm, beatTimesSec: beats, beatsPerBar: 4, downbeatIndex, durationSec, energyPerBeat, loudestStartSec: beats[loudIdx] ?? 0 };
}

export async function analyzeBeatsFile(file: string): Promise<BeatAnalysis | null> {
  return analyzeBeats(await decodeMono(file));
}
