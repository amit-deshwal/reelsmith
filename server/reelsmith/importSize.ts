// RS-1248: imports that are re-encoded anyway (iPhone HDR, variable frame rate) are converted at most 2560 px on the long
// side, even under the "Master quality" policy. The Mac's encoder converts 4K60 at about real time (15.1 s for a 14.7 s
// clip; 5.8 s at 1440x2560), and a reel is delivered at 1080x1920, so 1440x2560 keeps 1.33x headroom for punch-ins and
// reframing. The bitrate follows the pixel count down. REELSMITH_IMPORT_MAX_PX sets another cap (0 turns it off).
const DEFAULT_MAX_PX = 2560;
// RS-1250: the copy is what every export reads, so the bitrate does not fall with the pixel count. Measured on a Torna
// 4K60 HLG clip against a ProRes XQ copy of the same conversion: luma PSNR 43.1 dB at the old pixel-scaled 16 Mbps,
// 45.1 dB at 32 Mbps, 46.3 dB at 48 Mbps. 2.5x lands an iPhone 4K clip at about its own bitrate, never above it.
const DETAIL_BOOST = 2.5;

export function importMaxPx(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REELSMITH_IMPORT_MAX_PX;
  if (raw === undefined || raw === '') return DEFAULT_MAX_PX;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_PX;
}

/** The capped output size and bitrate for a master-quality re-encode. */
export function capImportSize(
  w: number, h: number, bitrate: number, floorBitrate: number, maxPx: number = importMaxPx(),
): { w: number; h: number; bitrate: number } {
  const longest = Math.max(w, h);
  if (!maxPx || longest <= maxPx) return { w, h, bitrate };
  const scale = maxPx / longest;
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  const cw = even(w), ch = even(h);
  const scaled = Math.round((bitrate * (cw * ch) * DETAIL_BOOST) / (w * h));
  return { w: cw, h: ch, bitrate: Math.max(floorBitrate, Math.min(bitrate, scaled)) };
}
