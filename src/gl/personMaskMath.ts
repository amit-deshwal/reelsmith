// Pure maths for the person matte (no DOM): turns the segmenter's confidence into the matte texture pixels and measures where the
// subject is. Kept apart from personMask.ts so it runs under `npx tsx`.

export interface SubjectInfo {
  /** centre of the subject, in shader coordinates (0..1, y up) */
  cx: number;
  cy: number;
  /** width and height of the subject's box as a share of the frame */
  w: number;
  h: number;
  /** share of the frame the subject covers (0 when nobody was found) */
  area: number;
}

/** What the effects assume when nobody is found: a person-sized box in the middle. */
export const NO_SUBJECT: SubjectInfo = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.6, area: 0 };

const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * confidence (0..1 per pixel, row 0 = top) -> opaque grey RGBA (r=g=b=matte, a=255) plus the subject's centre and box.
 * The matte is a soft threshold so edges stay smooth but the body is solid; it is opaque on purpose, because a canvas stores
 * premultiplied alpha and a matte kept in alpha would be squared on upload.
 */
export function matteFromConfidence(conf: ArrayLike<number>, w: number, h: number, lo = 0.3, hi = 0.7): { rgba: Uint8ClampedArray; subject: SubjectInfo } {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const cols = new Uint32Array(w);
  const rows = new Uint32Array(h);
  let count = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = smooth(lo, hi, conf[y * w + x] ?? 0);
      const o = (y * w + x) * 4;
      const g = Math.round(v * 255);
      rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
      if (v > 0.5) { count += 1; sumX += x + 0.5; sumY += y + 0.5; cols[x]! += 1; rows[y]! += 1; }
    }
  }
  const area = count / (w * h);
  if (area < 0.004) return { rgba, subject: { ...NO_SUBJECT } };
  // box from the 1st to the 99th percentile, so a stray speck of noise does not stretch it
  const edge = (hist: Uint32Array, from: number) => {
    const target = count * from;
    let seen = 0;
    for (let i = 0; i < hist.length; i++) { seen += hist[i]!; if (seen >= target) return i; }
    return hist.length - 1;
  };
  const x0 = edge(cols, 0.01), x1 = edge(cols, 0.99) + 1, y0 = edge(rows, 0.01), y1 = edge(rows, 0.99) + 1;
  return {
    rgba,
    subject: { cx: sumX / count / w, cy: 1 - sumY / count / h, w: Math.max(0.02, (x1 - x0) / w), h: Math.max(0.02, (y1 - y0) / h), area },
  };
}

/** The uniforms every mask effect receives about the subject. */
export function subjectUniforms(s: SubjectInfo): Record<string, number | number[]> {
  return { u_subjectCenter: [s.cx, s.cy], u_subjectSize: [s.w, s.h], u_subjectArea: s.area };
}

/** A person-shaped stand-in (head and shoulders) for thumbnails and previews that have no real segmentation. Row 0 = top. */
export function syntheticPersonConfidence(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const head = Math.hypot((u - 0.5) / 0.13, (v - 0.34) / 0.16) < 1;
      const body = Math.hypot((u - 0.5) / 0.32, (v - 0.86) / 0.4) < 1;
      out[y * w + x] = head || body ? 1 : 0;
    }
  }
  return out;
}
