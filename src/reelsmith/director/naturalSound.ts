// RS-1225: moments the footage is heard. Under a song every director clip is silent; editors let the song dip for a shout
// at the top, a splash, laughter or a line someone says (or stop it outright for a beat before the drop), which makes a
// reel feel real. A section's naturalSound gives its base clips their sound back and ducks the song around it.

/** A stretch where the clips' own sound plays, in reel frames; solo stops the song there. */
export interface NaturalWindow { from: number; to: number; solo: boolean }

/** How far the song dips under natural sound (about -12 dB): still there, clearly behind the voice or the splash. */
export const NATURAL_UNDER = 0.25;

/**
 * Volume keyframes for the song around natural-sound stretches. Under: it eases down just before the cut and back up
 * just after. Solo: it cuts out on the section's first beat and is back at full on the next section's first beat, so
 * the music lands with the cut. Neighbouring stretches merge.
 */
export function songDuck(windows: readonly NaturalWindow[], gain: number, total: number, fps: number): Array<{ frame: number; value: number }> {
  if (!windows.length) return [];
  const lead = Math.round(fps * 0.15), tail = Math.round(fps * 0.25);
  const sorted = [...windows].sort((a, b) => a.from - b.from);
  const merged: NaturalWindow[] = [];
  for (const w of sorted) {
    const last = merged.at(-1);
    if (last && w.from - lead <= last.to + tail && last.solo === w.solo) last.to = Math.max(last.to, w.to);
    else merged.push({ ...w });
  }
  const out: Array<{ frame: number; value: number }> = [];
  const put = (frame: number, value: number) => {
    const f = Math.min(total, Math.max(0, Math.round(frame)));
    const prev = out.at(-1);
    if (prev && f <= prev.frame) { if (f === prev.frame) prev.value = value; return; }
    out.push({ frame: f, value });
  };
  for (const w of merged) {
    const low = w.solo ? 0 : gain * NATURAL_UNDER;
    const down = w.solo ? 2 : lead, up = w.solo ? 2 : tail;
    if (w.from - down > 0) put(w.from - down, gain);
    put(w.from, low);
    if (w.to >= total) { put(total, low); continue; }
    put(w.solo ? w.to - up : w.to, low);
    put(w.solo ? w.to : w.to + up, gain);
  }
  if (out[0] && out[0].frame > 0) out.unshift({ frame: 0, value: gain });
  return out;
}

/** A clip with its sound on, ramped in and out over a few frames so the cut does not click. */
export function heardClip<T extends { durationInFrames: number }>(item: T): T {
  const d = item.durationInFrames;
  const ramp = Math.min(3, Math.floor(d / 4));
  const kf = (item as { keyframes?: Record<string, unknown> }).keyframes;
  return { ...item, volume: 1, ...(ramp > 0 ? { keyframes: { ...(kf ?? {}), volume: [{ frame: 0, value: 0 }, { frame: ramp, value: 1 }, { frame: d - ramp, value: 1 }, { frame: d, value: 0 }] } } : {}) };
}
