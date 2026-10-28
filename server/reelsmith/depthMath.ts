// RS-1238: turning the depth model's output into the map the parallax reads (pure, no model or image library).
// The model sees the photo at 518 px and its edges are soft and a little fat: a band of sky around a tree is called
// "near" and travels with the tree, leaving a ghost of the outline when the camera moves. So the map is brought up to
// the output size and snapped to the photo's own edges with a guided filter (He et al.), using the photo's colour as the
// guide, before a small grow and blur.

/** Stretched between the 2nd and 98th percentile (one bright sky or a very near branch does not flatten the rest), 0..1. */
export function normalizeDepth(depth: Float32Array): Float32Array {
  const n = depth.length;
  const sorted = Float32Array.from(depth).sort();
  const lo = sorted[Math.floor(n * 0.02)] ?? 0;
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.98))] ?? 1;
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, (depth[i]! - lo) / span));
  return out;
}

export function resizeBilinear(src: Float32Array, w: number, h: number, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) * h) / outH - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < outW; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) * w) / outW - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = src[y0 * w + x0]! * (1 - tx) + src[y0 * w + x1]! * tx;
      const b = src[y1 * w + x0]! * (1 - tx) + src[y1 * w + x1]! * tx;
      out[y * outW + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Mean over a (2r+1)² window (clipped at the borders), from a summed-area table. */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]!;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1]! + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * (w + 1) + x1]! - sat[y0 * (w + 1) + x1]! - sat[y1 * (w + 1) + x0]! + sat[y0 * (w + 1) + x0]!;
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Guided filter: `p` smoothed, but its edges follow the edges of `guide` (both 0..1, same size). */
export function guidedFilter(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const ip = new Float32Array(n), ii = new Float32Array(n);
  for (let i = 0; i < n; i++) { ip[i] = guide[i]! * p[i]!; ii[i] = guide[i]! * guide[i]!; }
  const mI = boxMean(guide, w, h, r), mP = boxMean(p, w, h, r), mIP = boxMean(ip, w, h, r), mII = boxMean(ii, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIP[i]! - mI[i]! * mP[i]!;
    const v = mII[i]! - mI[i]! * mI[i]!;
    a[i] = cov / (v + eps);
    b[i] = mP[i]! - a[i]! * mI[i]!;
  }
  const mA = boxMean(a, w, h, r), mB = boxMean(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, mA[i]! * guide[i]! + mB[i]!));
  return out;
}

/** Max over a (2r+1)² window: near values grow outwards by r pixels. */
export function growNear(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src;
  const pass = (from: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
          m = Math.max(m, from[yy * w + xx]!);
        }
        out[y * w + x] = m;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

/**
 * Guided filter with a colour guide (rgb interleaved, 0..1): edges between colours of similar brightness (green trees
 * on a turquoise sea) are kept too, which a brightness guide misses.
 */
export function guidedFilterRgb(rgb: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const ch = (c: number) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rgb[i * 3 + c]!; return o; };
  const I = [ch(0), ch(1), ch(2)];
  const prod = (x: Float32Array, y: Float32Array) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = x[i]! * y[i]!; return o; };
  const m = I.map((c) => boxMean(c, w, h, r));
  const mP = boxMean(p, w, h, r);
  const mIp = I.map((c) => boxMean(prod(c, p), w, h, r));
  // the guide's covariance per window: rr rg rb gg gb bb
  const pairs: Array<[number, number]> = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  const cov = pairs.map(([i, j]) => boxMean(prod(I[i]!, I[j]!), w, h, r));
  const a0 = new Float32Array(n), a1 = new Float32Array(n), a2 = new Float32Array(n), b = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const mr = m[0]![k]!, mg = m[1]![k]!, mb = m[2]![k]!;
    const rr = cov[0]![k]! - mr * mr + eps, rg = cov[1]![k]! - mr * mg, rb = cov[2]![k]! - mr * mb;
    const gg = cov[3]![k]! - mg * mg + eps, gb = cov[4]![k]! - mg * mb, bb = cov[5]![k]! - mb * mb + eps;
    const cr = mIp[0]![k]! - mr * mP[k]!, cg = mIp[1]![k]! - mg * mP[k]!, cb = mIp[2]![k]! - mb * mP[k]!;
    // (Sigma + eps I)^-1 * cov(I, p), by the adjugate of the symmetric 3x3
    const i00 = gg * bb - gb * gb, i01 = rb * gb - rg * bb, i02 = rg * gb - rb * gg;
    const i11 = rr * bb - rb * rb, i12 = rb * rg - rr * gb, i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const inv = Math.abs(det) > 1e-12 ? 1 / det : 0;
    a0[k] = (i00 * cr + i01 * cg + i02 * cb) * inv;
    a1[k] = (i01 * cr + i11 * cg + i12 * cb) * inv;
    a2[k] = (i02 * cr + i12 * cg + i22 * cb) * inv;
    b[k] = mP[k]! - a0[k]! * mr - a1[k]! * mg - a2[k]! * mb;
  }
  const mA0 = boxMean(a0, w, h, r), mA1 = boxMean(a1, w, h, r), mA2 = boxMean(a2, w, h, r), mB = boxMean(b, w, h, r);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = Math.min(1, Math.max(0, mA0[k]! * I[0]![k]! + mA1[k]! * I[1]![k]! + mA2[k]! * I[2]![k]! + mB[k]!));
  return out;
}

export interface DepthMapOptions {
  /** the photo at the output size, 0..255, one channel (brightness) or three (rgb); without it the map is only resized */
  guide?: Uint8Array;
  outWidth?: number;
  outHeight?: number;
  /** guided filter window radius and smoothness, in output pixels and squared brightness */
  radius?: number;
  eps?: number;
  /** near values grown by this many output pixels, so the first background pixels move with a near edge */
  grow?: number;
  /** final blur radius: the remaining steps become short ramps */
  blur?: number;
}

/** Model output (relative inverse depth, bigger = nearer) to an 8-bit map at the output size, white = near. */
export function depthToGray(depth: Float32Array, width: number, height: number, opts: DepthMapOptions = {}): Uint8Array {
  const outW = opts.outWidth ?? width, outH = opts.outHeight ?? height;
  let d = normalizeDepth(depth);
  if (outW !== width || outH !== height) d = resizeBilinear(d, width, height, outW, outH);
  const channels = opts.guide ? opts.guide.length / (outW * outH) : 0;
  if (opts.guide && (channels === 1 || channels === 3)) {
    const g = new Float32Array(opts.guide.length);
    for (let i = 0; i < g.length; i++) g[i] = opts.guide[i]! / 255;
    d = channels === 3 ? guidedFilterRgb(g, d, outW, outH, opts.radius ?? 8, opts.eps ?? 2e-3) : guidedFilter(g, d, outW, outH, opts.radius ?? 8, opts.eps ?? 2e-3);
  }
  d = growNear(d, outW, outH, opts.grow ?? 0);
  if ((opts.blur ?? 0) > 0) d = boxMean(d, outW, outH, opts.blur!);
  const gray = new Uint8Array(outW * outH);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(d[i]! * 255);
  return gray;
}
