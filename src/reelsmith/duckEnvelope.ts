// RS-603: music ducking under speech with an attack/release ramp instead of a hard step (a 12 dB step in one frame clicks
// on real music). The ramp starts `attackSec` before the speech so its first word is already ducked, and recovers over
// `releaseSec` after it. The ramp is linear in dB. Pauses between lines shorter than `DUCK_HOLD_SEC` stay ducked, so the
// music does not swell up and back down between sentences.
export const DUCK_ATTACK_SEC = 0.2;
export const DUCK_RELEASE_SEC = 0.4;
export const DUCK_HOLD_SEC = 0.5;

export type FrameRange = readonly [from: number, to: number];

const bridged = new WeakMap<readonly FrameRange[], Map<number, FrameRange[]>>();

/** Sorted ranges with gaps shorter than `holdFrames` joined. Cached per ranges array (the composition asks once per frame per clip). */
export function bridgeGaps(ranges: readonly FrameRange[], holdFrames: number): FrameRange[] {
  const byHold = bridged.get(ranges) ?? new Map<number, FrameRange[]>();
  const cached = byHold.get(holdFrames);
  if (cached) return cached;
  const out: Array<[number, number]> = [];
  for (const [from, to] of [...ranges].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && from - last[1] < holdFrames) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  byHold.set(holdFrames, out);
  bridged.set(ranges, byHold);
  return out;
}

/** How far ducked a frame is: 0 = open, 1 = fully ducked. Overlapping or nearby speech takes the deepest value. */
export function duckAmount(frame: number, input: readonly FrameRange[], fps: number, attackSec = DUCK_ATTACK_SEC, releaseSec = DUCK_RELEASE_SEC, holdSec = DUCK_HOLD_SEC): number {
  const ranges = bridgeGaps(input, Math.round(holdSec * fps));
  const attack = Math.max(1, Math.round(attackSec * fps));
  const release = Math.max(1, Math.round(releaseSec * fps));
  let amount = 0;
  for (const [from, to] of ranges) {
    let w = 0;
    if (frame >= from && frame < to) w = 1;
    else if (frame < from && frame >= from - attack) w = (frame - (from - attack) + 1) / (attack + 1);
    else if (frame >= to && frame < to + release) w = 1 - (frame - to + 1) / (release + 1);
    if (w > amount) amount = w;
    if (amount >= 1) return 1;
  }
  return amount;
}

/** Linear gain for a follower track at `frame`. */
export function duckGainAt(frame: number, ranges: readonly FrameRange[], fps: number, depthDb: number): number {
  const amount = duckAmount(frame, ranges, fps);
  return amount > 0 ? 10 ** ((depthDb * amount) / 20) : 1;
}
