// RS-1260: turning the depth model's per-frame output into a depth track that holds still over time (pure, no model).
// The model gives relative inverse depth: each frame has its own unknown scale and offset, so normalising each frame by
// its own range makes a still background breathe as a person walks in or the view widens. Each frame is instead lined
// up with the one before by the scale and offset that best fit it (least squares, ignoring the pixels that fit worst:
// a moving person), then the whole track is stretched by one range, and each pixel is smoothed with its neighbours in
// time where they agree (a still background), not where they differ (something moved there).

export interface RawFrame { depth: Float32Array; width: number; height: number }

/** a, b so that a * x + b fits y best over the sampled pixels, after dropping the `trim` share that fit worst. */
export function fitScaleOffset(x: Float32Array, y: Float32Array, trim = 0.2, sample = 4): { a: number; b: number } {
  const idx: number[] = [];
  for (let i = 0; i < x.length; i += sample) idx.push(i);
  const solve = (use: number[]) => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const i of use) { const xi = x[i]!, yi = y[i]!; sx += xi; sy += yi; sxx += xi * xi; sxy += xi * yi; }
    const n = Math.max(1, use.length);
    const v = sxx / n - (sx / n) ** 2;
    const a = v > 1e-12 ? (sxy / n - (sx / n) * (sy / n)) / v : 1;
    return { a, b: sy / n - a * (sx / n) };
  };
  let fit = solve(idx);
  for (let pass = 0; pass < 2 && trim > 0; pass++) {
    const res = idx.map((i) => Math.abs(fit.a * x[i]! + fit.b - y[i]!));
    const cut = Float32Array.from(res).sort()[Math.floor(res.length * (1 - trim))] ?? Infinity;
    fit = solve(idx.filter((_, k) => res[k]! <= cut));
  }
  return fit;
}

function percentile(values: Float32Array, q: number, sample = 3): number {
  const s: number[] = [];
  for (let i = 0; i < values.length; i += sample) s.push(values[i]!);
  s.sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] ?? 0;
}

export interface TrackOptions {
  /** how much each frame is pulled toward its own range after lining up (0 = lined up only); stops slow drift on a long pan */
  selfPull?: number;
  /** frames either side averaged in time, and how far two depths may differ (0..1) and still be averaged */
  radius?: number;
  agree?: number;
}

/**
 * The frames lined up and stretched to 0..1 by one range (2nd to 98th percentile over the track, white = near), then
 * smoothed in time. All frames must be the same size.
 */
export function stabiliseTrack(frames: RawFrame[], o: TrackOptions = {}): Float32Array[] {
  if (!frames.length) return [];
  const selfPull = o.selfPull ?? 0.15, radius = o.radius ?? 2, agree = o.agree ?? 0.06;
  const n = frames[0]!.depth.length;
  // each frame in the scale of the first
  const lined: Float32Array[] = [];
  for (let k = 0; k < frames.length; k++) {
    const d = frames[k]!.depth;
    if (d.length !== n) throw new Error('depth track frames differ in size');
    if (k === 0) { lined.push(Float32Array.from(d)); continue; }
    const prev = lined[k - 1]!;
    const fit = fitScaleOffset(d, prev);
    // the frame's own range mapped onto the track's so far: what it would be on its own
    const lo = percentile(d, 0.02), hi = percentile(d, 0.98);
    const tlo = percentile(prev, 0.02), thi = percentile(prev, 0.98);
    const selfA = hi - lo > 1e-6 ? (thi - tlo) / (hi - lo) : fit.a;
    const selfB = tlo - selfA * lo;
    const a = fit.a * (1 - selfPull) + selfA * selfPull, b = fit.b * (1 - selfPull) + selfB * selfPull;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = a * d[i]! + b;
    lined.push(out);
  }
  // one range for the whole track
  const los = lined.map((d) => percentile(d, 0.02)).sort((p, q) => p - q);
  const his = lined.map((d) => percentile(d, 0.98)).sort((p, q) => p - q);
  const lo = los[Math.floor(los.length / 2)]!, hi = his[Math.floor(his.length / 2)]!;
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  const norm = lined.map((d) => { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, (d[i]! - lo) / span)); return out; });
  if (radius <= 0 || norm.length < 2) return norm;
  // in time: neighbours that agree with this frame's depth at the pixel
  const sigma = Math.max(0.5, radius / 1.5);
  return norm.map((cur, k) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = cur[i]!;
      let sum = c, w = 1;
      for (let j = Math.max(0, k - radius); j <= Math.min(norm.length - 1, k + radius); j++) {
        if (j === k) continue;
        const v = norm[j]![i]!;
        const dv = (v - c) / agree;
        const wj = Math.exp(-((j - k) ** 2) / (2 * sigma * sigma)) * Math.exp(-dv * dv);
        sum += v * wj; w += wj;
      }
      out[i] = sum / w;
    }
    return out;
  });
}
