// RS-501: whisper.cpp's DTW word times come from cross-attention and land inside the word, not at its start: on joined
// English speech every start was late, 180-450 ms, longer words more. A caption that appears a quarter second after its
// word is spoken reads as out of sync. The audio says where words begin: speech energy rises at a word's first sound. So
// each word start moves back to the strongest rise in the sound between the previous word and its DTW time.

export interface TimedWord {
  readonly text: string;
  /** ms */
  readonly start: number;
  /** ms */
  readonly end: number;
}

export interface OnsetCurve {
  /** ms between values */
  readonly hopMs: number;
  /** spectral flux per hop: how much louder each band got, summed (0 where nothing rises) */
  readonly flux: Float32Array;
  /** level per hop, dB */
  readonly level: Float32Array;
}

const HOP_MS = 10;
const FFT = 512;
const BANDS = 24;
const LO_HZ = 120;
const HI_HZ = 5000;

function fftMag(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Band energies every 10 ms on a log frequency scale, then how much they rose over the last 20 ms. */
export function onsetCurve(samples: Float32Array, sampleRate: number): OnsetCurve {
  const hop = Math.round((sampleRate * HOP_MS) / 1000);
  const frames = Math.max(0, Math.floor(samples.length / hop));
  const win = new Float64Array(FFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)));
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => {
    const hz = LO_HZ * (HI_HZ / LO_HZ) ** (b / BANDS);
    return Math.min(FFT / 2, Math.max(1, Math.round((hz * FFT) / sampleRate)));
  });
  const logE = Array.from({ length: frames }, () => new Float32Array(BANDS));
  const level = new Float32Array(frames);
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  for (let f = 0; f < frames; f += 1) {
    // the frame is centred on its hop so a rise is timed where it happens
    const at = f * hop - FFT / 2;
    for (let i = 0; i < FFT; i += 1) {
      re[i] = (samples[at + i] ?? 0) * win[i]!;
      im[i] = 0;
    }
    fftMag(re, im);
    let total = 0;
    for (let b = 0; b < BANDS; b += 1) {
      let e = 0;
      for (let k = edges[b]!; k < Math.max(edges[b]! + 1, edges[b + 1]!); k += 1) e += re[k]! * re[k]! + im[k]! * im[k]!;
      total += e;
      logE[f]![b] = Math.log10(1e-9 + e);
    }
    level[f] = 10 * Math.log10(1e-12 + total);
  }
  const flux = new Float32Array(frames);
  for (let f = 2; f < frames; f += 1) {
    let sum = 0;
    for (let b = 0; b < BANDS; b += 1) sum += Math.max(0, logE[f]![b]! - logE[f - 2]![b]!);
    flux[f] = sum;
  }
  return { hopMs: HOP_MS, flux, level };
}

export interface SnapOptions {
  /** how far before its DTW time a word may start, ms */
  readonly searchMs?: number;
  /** how far after, ms */
  readonly afterMs?: number;
  /** where in the search the start most likely is, ms before the DTW time; measured per clip when left out */
  readonly expectMs?: number;
  /** how quickly a rise far from the expected place loses out, ms */
  readonly spreadMs?: number;
  /** a word starts at least this long after the one before, ms */
  readonly minGapMs?: number;
}

export const SNAP_DEFAULTS: Required<Omit<SnapOptions, 'expectMs'>> = {
  searchMs: 520,
  afterMs: 40,
  spreadMs: 200,
  minGapMs: 70,
};
/** the search reaches this far past the measured lag */
const SEARCH_PAST_LAG_MS = 200;

function strongRise(flux: Float32Array): number {
  const peaks: number[] = [];
  for (let f = 1; f + 1 < flux.length; f += 1) if (flux[f]! > flux[f - 1]! && flux[f]! >= flux[f + 1]!) peaks.push(flux[f]!);
  peaks.sort((a, b) => a - b);
  return peaks[Math.floor(peaks.length * 0.75)] ?? 0;
}

const LAG_STEP_MS = 10;
const LAG_MAX_MS = 450;
const LAG_REACH_MS = 50;
/** a lag must line up this many more words than no lag before it is believed */
const LAG_GAIN = 1.05;

/**
 * How late this clip's word times run, ms: the lag that puts the most word times (moved back by it) on a rise in the
 * sound. Models and languages differ (turbo runs ~250 ms late in English and on time in Hindi), so it is measured, not
 * assumed. Under 6 words there is too little to measure and the answer is 0.
 */
export function estimateLagMs(words: readonly TimedWord[], curve: OnsetCurve): number {
  const { flux, hopMs } = curve;
  if (words.length < 6 || !flux.length) return 0;
  const strong = strongRise(flux);
  if (strong <= 0) return 0;
  const reach = Math.round(LAG_REACH_MS / hopMs);
  const fit = (lag: number) => {
    let sum = 0;
    for (const w of words) {
      const c = Math.round((w.start - lag) / hopMs);
      let m = 0;
      for (let f = Math.max(0, c - reach); f <= Math.min(flux.length - 1, c + reach); f += 1) m = Math.max(m, flux[f]!);
      sum += Math.min(1, m / strong);
    }
    return sum;
  };
  const base = fit(0);
  let best = 0;
  let bestFit = base;
  for (let lag = LAG_STEP_MS; lag <= LAG_MAX_MS; lag += LAG_STEP_MS) {
    const v = fit(lag);
    if (v > bestFit) {
      bestFit = v;
      best = lag;
    }
  }
  return bestFit >= base * LAG_GAIN ? best : 0;
}

/**
 * Move each word's start to the strongest rise in the sound between the word before and its own DTW time (weighted
 * toward `expectMs` before it). A word's end never moves, and no start passes its end or the start before it. A word with
 * no rise in reach (a song louder than the voice, a flat drone) moves back by the lag alone.
 */
export function snapWordStarts<T extends TimedWord>(words: readonly T[], curve: OnsetCurve, options: SnapOptions = {}): T[] {
  const { flux, hopMs } = curve;
  if (!flux.length || !words.length) return [...words];
  const expectMs = options.expectMs ?? estimateLagMs(words, curve);
  const o = { ...SNAP_DEFAULTS, searchMs: Math.min(SNAP_DEFAULTS.searchMs, expectMs + SEARCH_PAST_LAG_MS), ...options, expectMs };
  // what a real rise looks like here: the strong rises of this clip
  const strong = strongRise(flux);
  const floor = strong * 0.25;
  const out: T[] = [];
  let previous = -Infinity;
  for (const word of words) {
    const lo = Math.max(word.start - o.searchMs, previous + o.minGapMs, 0);
    const hi = Math.min(word.start + o.afterMs, word.end - o.minGapMs / 2, (flux.length - 1) * hopMs);
    let best = -1;
    let bestScore = 0;
    for (let f = Math.ceil(lo / hopMs); f <= Math.floor(hi / hopMs); f += 1) {
      const v = flux[f]!;
      if (v < floor || v < (flux[f - 1] ?? 0) || v < (flux[f + 1] ?? 0)) continue;
      const d = (f * hopMs - (word.start - o.expectMs)) / o.spreadMs;
      const score = v * Math.exp(-0.5 * d * d);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    // the energy starts climbing a little before the strongest rise: step back to where it began
    // no rise in reach: the clip's measured lag is still the best guess
    let start = word.start - o.expectMs;
    if (best >= 0) {
      let f = best;
      while (f - 1 >= Math.ceil(lo / hopMs) && flux[f - 1]! > flux[best]! * 0.35) f -= 1;
      start = f * hopMs;
    }
    start = Math.max(start, previous + o.minGapMs, 0);
    if (start > word.start) start = Math.max(previous + o.minGapMs, Math.min(word.start, start));
    out.push({ ...word, start: Math.round(start) });
    previous = start;
  }
  // a word that now starts earlier cuts the one before it short, never overlaps it
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1]!;
    if (prev.end > out[i]!.start) out[i - 1] = { ...prev, end: Math.max(prev.start, out[i]!.start) };
  }
  return out;
}
