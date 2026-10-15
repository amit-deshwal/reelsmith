// RS-203: find the drop as the biggest jump in energy between two adjacent bars.
/** `energyPerBeat[i]` is loudness (any positive scale) of the audio during beat i. Returns the beat index of the drop, or null. */
export function detectDropBeat(energyPerBeat: number[], beatsPerBar: number, minLeadBars = 2): number | null {
  const bar = beatsPerBar;
  const bars = Math.floor(energyPerBeat.length / bar);
  if (bars < minLeadBars + 2) return null;
  const mean = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i += 1) s += energyPerBeat[i]!;
    return s / Math.max(1, to - from);
  };
  let best = -1; let bestJump = 0;
  for (let b = minLeadBars; b <= bars - 1; b += 1) {
    const before = mean(Math.max(0, (b - 2) * bar), b * bar);
    const after = mean(b * bar, Math.min(energyPerBeat.length, (b + 2) * bar));
    const jump = (after - before) / Math.max(1e-6, before);
    if (jump > bestJump) { bestJump = jump; best = b; }
  }
  // require a real jump, not noise
  return best >= 0 && bestJump > 0.25 ? best * bar : null;
}
