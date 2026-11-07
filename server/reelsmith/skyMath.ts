// RS-1261: the sky of a frame, from its depth map and its picture (no model of its own). The sky is what is farthest
// (black in the depth map), looks like the sky at the top of the frame, and is reached from the top edge without crossing
// a strong edge: distant hills are nearly as far but a different colour, and a ridge or a head against the sky is an edge.
// Pure maths on plain arrays so it runs under `npx tsx`; server/reelsmith/depthMap.ts saves the result next to the depth map.

export interface SkyOptions {
  /** how much nearer than the sky's own depth (0..255, white = near) a pixel may be */
  depthSlack?: number;
  /** colour distance from the sky's colour, in the sky's own spread (per channel standard deviations) */
  colorLimit?: number;
  /** strongest step between neighbouring pixels the fill may cross (sum of RGB differences) */
  edgeLimit?: number;
  /** soften the outline by this many pixels */
  blur?: number;
  /** how far the gate reaches past the sky, as a share of the short edge (default 0.05: one map for a whole shot; a map
   *  per frame needs only the motion between two maps; 0 for a photo, whose map is made from the very picture it grades:
   *  the gate is then the sky itself, so nothing sky-coloured beside it, haze or a head, is found again by its colour) */
  gateReach?: number;
  /** finest detail (standard deviation of luma, 0..1, over 5 x 5 pixels) the haze and pale-sky tests take (default 0.02;
   *  the sky of the trek frames stays under it, a far town or a curtain of threads is as pale as haze but busier) */
  textureLimit?: number;
  /** where the texture test applies: only to what is paler than the sky (haze, cloud, the horizon), or everywhere */
  textureIn?: 'pale' | 'all';
}

export interface SkyMask {
  /** 0..255 per pixel, row 0 = top */
  mask: Uint8Array;
  /** share of the frame that is sky */
  share: number;
  /** Where the sky can be in other frames of a moving shot: the mask widened by about a twentieth of the frame, softly. */
  gate: Uint8Array;
  /** The sky's colour, for finding it again in each frame (a handheld shot moves away from the frame the map was made
   *  from): chromaticity (r, g share of r+g+b) of its own colour and its spread; the line runs from it to grey (1/3, 1/3). */
  model: SkyModel | null;
}

export interface SkyModel { chroma: [number, number]; spread: [number, number]; limit: number; lumaFloor: number; paleFloor: number }

/** Under this share there is no sky worth grading (a sliver between trees, a window). */
export const MIN_SKY_SHARE = 0.01;
/** The sky rule's version, saved with every sky map; maps made under an older rule are made again from their saved depth. */
export const SKY_RULE = 2;
/** Under this share of the found sky on the far end of the depth map, it is a ceiling or a wall, not a sky. */
export const FLAT_SKY_SHARE = 0.5;

export function skyFromDepth(depth: Uint8Array, rgb: Uint8Array, w: number, h: number, o: SkyOptions = {}): SkyMask {
  const n = w * h;
  const empty: SkyMask = { mask: new Uint8Array(n), share: 0, gate: new Uint8Array(n), model: null };
  if (depth.length < n || rgb.length < n * 3) return empty;
  const depthSlack = o.depthSlack ?? 8, colorLimit = o.colorLimit ?? 3, edgeLimit = o.edgeLimit ?? 54;
  const luma = (p: number) => (rgb[p * 3]! * 0.2126 + rgb[p * 3 + 1]! * 0.7152 + rgb[p * 3 + 2]! * 0.0722) / 255;

  // the sky's depth: the far end of the top tenth of the frame
  const top = Math.max(1, Math.round(h * 0.1));
  const hist = new Uint32Array(256);
  for (let p = 0; p < w * top; p++) hist[depth[p]!]! += 1;
  let seen = 0, far = 0;
  for (; far < 255; far++) { seen += hist[far]!; if (seen >= w * top * 0.05) break; }
  // the top of the frame must reach the far end of the depth range (maps run 0 = farthest .. 255 = nearest)
  if (far > 40) return empty;
  const depthMax = far + depthSlack;
  // a night sky, or a top edge that is not sky (a ceiling, a face filling the frame)
  const isSkyish = (p: number) => depth[p]! <= depthMax && luma(p) >= 0.22;

  // the sky's colour, from the far, light pixels of the top band, as chromaticity (hue and saturation without
  // brightness: a cloud is a lighter or darker grey of the same sky, a tree a different hue at any brightness)
  const chroma = (p: number): [number, number] => {
    const r = rgb[p * 3]!, g = rgb[p * 3 + 1]!, b = rgb[p * 3 + 2]!, t = r + g + b + 1;
    return [r / t, g / t];
  };
  // median and spread (MAD) rather than mean and deviation: foliage on a hilltop in the band must not widen the sky's colour
  const band = Math.max(1, Math.round(h * 0.15));
  const cr: number[] = [], cg: number[] = [], lumas: number[] = [];
  for (let p = 0; p < w * band; p++) {
    if (!isSkyish(p)) continue;
    const c = chroma(p);
    cr.push(c[0]); cg.push(c[1]); lumas.push(luma(p));
  }
  const count = cr.length;
  if (count < w * band * 0.05) return empty;
  const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]!; };
  const mean = [median(cr), median(cg)];
  // A sky is blue, grey, white or warm, never green: a top band of far, bright leaves (a pan past trees, blurred so the
  // depth model reads it far) would otherwise make every green thing in the frame "sky".
  if (mean[1]! - Math.max(mean[0]!, 1 - mean[0]! - mean[1]!) > 0.03) return empty;
  const sd = [cr, cg].map((v, k) => Math.max(0.012, 1.4826 * median(v.map((x) => Math.abs(x - mean[k]!)))));
  // nothing much darker than the sky itself: dark foliage and rock are not sky even when grey
  const lumaFloor = Math.max(0.22, median(lumas) * 0.55);
  const paleFloor = median(lumas) * 0.92;
  // The sky is not one brightness across the frame (it darkens toward one side, away from the sun, or under the lens's
  // vignette), so haze at the darker side's horizon is judged against the sky above it: the floor of each column from
  // the top band within an eighth of the width, never above the frame's own.
  const paleAt = new Float32Array(w).fill(paleFloor);
  {
    const win = Math.max(1, Math.round(w / 8)), stride = Math.max(1, Math.round(w / 32));
    const colMedian = new Float32Array(w).fill(NaN);
    for (let cx = 0; cx < w; cx += stride) {
      const v: number[] = [];
      for (let y = 0; y < band; y++) for (let x = Math.max(0, cx - win); x <= Math.min(w - 1, cx + win); x += 2) { const p = y * w + x; if (isSkyish(p)) v.push(luma(p)); }
      if (v.length >= band * win * 0.25) colMedian[cx] = median(v) * 0.92;
    }
    for (let x = 0; x < w; x++) {
      const k = Math.min(w - 1, Math.round(x / stride) * stride);
      const local = colMedian[k - (k % stride)]!;
      if (Number.isFinite(local)) paleAt[x] = Math.max(lumaFloor, Math.min(paleFloor, local));
    }
  }
  const textureLimit = o.textureLimit ?? 0.02, textureAll = o.textureIn === 'all';
  const busy = Number.isFinite(textureLimit) && textureLimit > 0 ? sameSideDeviation(rgb, w, h, 2) : null;
  const accept = (p: number) => {
    if (depth[p]! > depthMax || luma(p) < lumaFloor) return false;
    if (textureAll && busy && busy[p]! > textureLimit) return false;
    // a sky pales toward the horizon and into haze and cloud: its colours run along the line from its own colour to grey,
    // so the distance is to that line (green and brown lie off it)
    const c = chroma(p);
    const ax = mean[0]!, ay = mean[1]!, bx = 1 / 3 - ax, by = 1 / 3 - ay;
    const t = Math.min(1, Math.max(0, ((c[0]! - ax) * bx + (c[1]! - ay) * by) / Math.max(1e-9, bx * bx + by * by)));
    if (Math.hypot((c[0]! - ax - t * bx) / sd[0]!, (c[1]! - ay - t * by) / sd[1]!) > colorLimit) return false;
    // paler than the sky's own colour must be as bright as the sky: haze and cloud are, a hazy valley far below is not
    return t <= 0.2 || (luma(p) >= paleAt[p % w]! && !(busy && busy[p]! > textureLimit));
  };
  const step = (a: number, b: number) => Math.abs(rgb[a * 3]! - rgb[b * 3]!) + Math.abs(rgb[a * 3 + 1]! - rgb[b * 3 + 1]!) + Math.abs(rgb[a * 3 + 2]! - rgb[b * 3 + 2]!);

  // grow from the top band (sky seen through leaves along the top edge starts below it)
  const sky = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let p = 0; p < w * band; p++) if (accept(p)) { sky[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % w, y = (p - x) / w;
    const visit = (q: number) => { if (!sky[q] && step(p, q) <= edgeLimit && accept(q)) { sky[q] = 1; queue[tail++] = q; } };
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (y > 0) visit(p - w);
    if (y < h - 1) visit(p + w);
  }
  // Haze at the horizon can be whiter or warmer than the line allows, and a grade on the land would then paint it as a
  // beige patch with a hard outline. Grow on from the sky into what is as far, as bright and nearly grey: distant hills
  // are darker, white clothes are near.
  const neutral = (p: number) => {
    const r = rgb[p * 3]!, g = rgb[p * 3 + 1]!, b = rgb[p * 3 + 2]!;
    const mx = Math.max(r, g, b);
    return mx > 0 && (mx - Math.min(r, g, b)) / mx <= 0.22;
  };
  const haze = (p: number) => depth[p]! <= depthMax && luma(p) >= Math.max(lumaFloor, paleAt[p % w]!) && neutral(p) && !(busy && busy[p]! > textureLimit);
  for (let k = 0; k < tail; k++) {
    const p = queue[k]!;
    const x = p % w, y = (p - x) / w;
    // a cumulus has a sharp edge against blue sky; the haze test is strict enough to cross steeper steps
    const visit = (q: number) => { if (!sky[q] && step(p, q) <= edgeLimit * 2 && haze(q)) { sky[q] = 1; queue[tail++] = q; } };
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (y > 0) visit(p - w);
    if (y < h - 1) visit(p + w);
  }
  const share = tail / n;
  // nothing to stand on: a wall or a ceiling of one colour, not a sky
  if (share < MIN_SKY_SHARE || share > 0.92) return empty;
  // A sky is at infinity: the depth model gives it no depth at all, so in a map stretched between its 2nd and 98th
  // percentiles (depthMath.ts normalizeDepth, skyTrackMath.ts stretchOwnRange) the whole sky sits flat on the far end.
  // A ceiling or a far wall indoors is only the farthest thing in the room and rises off it: on the trek frames 94-100%
  // of the sky lies within a step of the far end, in a mall 0-21%.
  let floor = 255;
  for (let p = 0; p < n && floor > 0; p++) floor = Math.min(floor, depth[p]!);
  let flat = 0;
  for (let k = 0; k < tail; k++) if (depth[queue[k]!]! <= floor + 1) flat++;
  if (flat < tail * FLAT_SKY_SHARE) return empty;

  // Holes in the sky become sky when they are specks (a bird, a wire), or far and not dark (a grey cloud the colour test
  // missed: left out it would take the land's grade as a patch). A leaf clump is dark and stays land; a hole that reaches
  // the bottom edge is land.
  fillHoles(sky, w, h, (region) => {
    if (region.length <= Math.max(64, Math.round(n * 0.0002))) return true;
    if (region.length > n * 0.08) return false;
    let far = 0, bright = 0;
    for (const p of region) { if (depth[p]! <= depthMax) far++; if (luma(p) >= lumaFloor) bright++; }
    return far >= region.length * 0.9 && bright >= region.length * 0.9;
  });
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = sky[p] ? 255 : 0;
  const soft = boxBlur(mask, w, h, o.blur ?? 3);
  let total = 0;
  for (let p = 0; p < n; p++) total += soft[p]!;
  const gate = o.gateReach === 0 ? soft.slice() : skyGate(mask, w, h, o.gateReach);
  const model: SkyModel = { chroma: [mean[0]!, mean[1]!], spread: [sd[0]!, sd[1]!], limit: colorLimit, lumaFloor, paleFloor };
  return { mask: soft, share: total / 255 / n, gate, model };
}

/** Fine detail on this pixel's own side of any edge: the standard deviation of luma (0..1) over a (2r+1)^2 window, counting
 *  only neighbours within `near` of the pixel's own luma. A far town or a curtain of threads is low-contrast detail and
 *  reads busy; pale sky beside a dark head or ridge leaves the head out and reads calm. (A plain deviation read every
 *  edge as busy, fenced pale sky off every head and the look graded it as a beige halo; opening that mask, or the structure
 *  tensor's smaller eigenvalue, let the town and far blue ridges back in.) */
export function sameSideDeviation(rgb: Uint8Array, w: number, h: number, r: number, near = 0.08): Float32Array {
  const n = w * h, L = new Float32Array(n), out = new Float32Array(n);
  for (let p = 0; p < n; p++) L[p] = (rgb[p * 3]! * 0.2126 + rgb[p * 3 + 1]! * 0.7152 + rgb[p * 3 + 2]! * 0.0722) / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = L[y * w + x]!;
    let k = 0, s = 0, s2 = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
      const v = L[yy * w + xx]!;
      if (Math.abs(v - c) > near) continue;
      k++; s += v; s2 += v * v;
    }
    const m = s / k;
    out[y * w + x] = Math.sqrt(Math.max(0, s2 / k - m * m));
  }
  return out;
}

/** Standard deviation of luma (0..1) over a (2r+1)^2 window, per pixel. */
export function localDeviation(rgb: Uint8Array, w: number, h: number, r: number): Float32Array {
  const n = w * h, L = new Float32Array(n), L2 = new Float32Array(n);
  for (let p = 0; p < n; p++) { const v = (rgb[p * 3]! * 0.2126 + rgb[p * 3 + 1]! * 0.7152 + rgb[p * 3 + 2]! * 0.0722) / 255; L[p] = v; L2[p] = v * v; }
  const m = boxMeanF(L, w, h, r), m2 = boxMeanF(L2, w, h, r), out = new Float32Array(n);
  for (let p = 0; p < n; p++) out[p] = Math.sqrt(Math.max(0, m2[p]! - m[p]! * m[p]!));
  return out;
}

function boxMeanF(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0, cnt = 0;
    for (let x = 0; x <= Math.min(w - 1, r); x++) { acc += src[y * w + x]!; cnt++; }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / cnt;
      const add = x + r + 1, sub = x - r;
      if (add < w) { acc += src[y * w + add]!; cnt++; }
      if (sub >= 0) { acc -= src[y * w + sub]!; cnt--; }
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, cnt = 0;
    for (let y = 0; y <= Math.min(h - 1, r); y++) { acc += tmp[y * w + x]!; cnt++; }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / cnt;
      const add = y + r + 1, sub = y - r;
      if (add < h) { acc += tmp[add * w + x]!; cnt++; }
      if (sub >= 0) { acc -= tmp[sub * w + x]!; cnt--; }
    }
  }
  return out;
}

/** Where the sky can be in other frames: the mask widened by `reach` of the short edge, softly. */
export function skyGate(mask: Uint8Array, w: number, h: number, reach = 0.05): Uint8Array {
  const r = Math.max(2, Math.round(Math.min(w, h) * reach));
  return boxBlur(maxFilter(mask, w, h, r), w, h, Math.round(r / 2));
}

/** Regions of 0 that do not reach the bottom edge are set to 1 when `fill` says so. */
function fillHoles(m: Uint8Array, w: number, h: number, fill: (region: number[]) => boolean): void {
  const seen = new Uint8Array(m.length);
  const stack: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (m[s] || seen[s]) continue;
    const region: number[] = [];
    let bottom = false;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % w, y = (p - x) / w;
      if (y === h - 1) bottom = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !m[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (!bottom && fill(region)) for (const p of region) m[p] = 1;
  }
}

/** Separable square max filter (dilation) of a single-channel image. */
export function maxFilter(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && m < 255; k++) m = Math.max(m, src[y * w + k]!);
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && m < 255; k++) m = Math.max(m, tmp[k * w + x]!);
    out[y * w + x] = m;
  }
  return out;
}

/** Separable box blur of a single-channel image. */
export function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length), out = new Uint8Array(src.length);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(acc / k);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}
