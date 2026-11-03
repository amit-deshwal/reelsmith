// RS-1225: moments the footage is heard. Under a song every director clip is silent; editors let the song dip for a shout
// at the top, a splash, laughter or a line someone says (or stop it outright for a beat before the drop), which makes a
// reel feel real. A section's naturalSound gives its base clips their sound back and ducks the song around it.

/**
 * A stretch where the clips' own sound plays, in reel frames; solo stops the song there. `songFactor` (RS-1258) dips the
 * song further under a quiet clip (1 = the usual -12 dB).
 */
export interface NaturalWindow { from: number; to: number; solo: boolean; songFactor?: number }

/** How far the song dips under natural sound (about -12 dB): still there, clearly behind the voice or the splash. */
export const NATURAL_UNDER = 0.25;

/**
 * RS-1258: the level a heard clip is brought to, in the clip analysis' `level` (dBFS of the speech band, 90th percentile):
 * a voice close to the phone. Measured on the 20 trek clips, talking reads -9 (a shout at the mic) to -34 (the selfie
 * the user found nearly silent under a solo at about -30).
 */
export const NATURAL_TARGET_DB = -20;
/** The most a clip is raised: the editor's volume tops out at 2 (+6 dB). */
const MAX_CLIP_GAIN_DB = 6;
/** The most the song dips below its usual level under a clip that is still too quiet after that. */
const MAX_EXTRA_DUCK_DB = 8;

/** How loud a clip gets over a stretch of its source frames: the loudest analysis window it overlaps, or undefined. */
export function sourceLevel(windows: ReadonlyArray<{ startFrame: number; endFrame: number; level?: number }> | undefined, from: number, to: number): number | undefined {
  let loudest: number | undefined;
  for (const w of windows ?? []) {
    if (w.level === undefined || w.endFrame <= from || w.startFrame >= to) continue;
    loudest = loudest === undefined ? w.level : Math.max(loudest, w.level);
  }
  return loudest;
}

/**
 * A heard clip whose sound reaches `level`: raised toward NATURAL_TARGET_DB (up to +6 dB) and, when it is quieter still,
 * the song dips further under it (up to 8 dB more). Never turned down: a shout should be loud. Unknown level: as before.
 */
export function levelNatural(level: number | undefined): { clipGain: number; songFactor: number } {
  if (level === undefined) return { clipGain: 1, songFactor: 1 };
  const need = NATURAL_TARGET_DB - level;
  if (need <= 0) return { clipGain: 1, songFactor: 1 };
  const clipDb = Math.min(MAX_CLIP_GAIN_DB, need);
  const duckDb = Math.min(MAX_EXTRA_DUCK_DB, need - clipDb);
  return { clipGain: Math.round(10 ** (clipDb / 20) * 100) / 100, songFactor: Math.round(10 ** (-duckDb / 20) * 1000) / 1000 };
}

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
    if (last && w.from - lead <= last.to + tail && last.solo === w.solo) {
      last.to = Math.max(last.to, w.to);
      // merged stretches dip as far as the quietest clip in them needs
      last.songFactor = Math.min(last.songFactor ?? 1, w.songFactor ?? 1);
    } else merged.push({ ...w });
  }
  const out: Array<{ frame: number; value: number }> = [];
  const put = (frame: number, value: number) => {
    const f = Math.min(total, Math.max(0, Math.round(frame)));
    const prev = out.at(-1);
    if (prev && f <= prev.frame) { if (f === prev.frame) prev.value = value; return; }
    out.push({ frame: f, value });
  };
  for (const w of merged) {
    const low = w.solo ? 0 : gain * NATURAL_UNDER * (w.songFactor ?? 1);
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

/** RS-1258: how far a heard section's sound leads its picture (a J-cut): the laugh is heard a moment before it is seen. */
export const JCUT_SEC = 0.2;
/** The lane the lead-ins play on (A0 voiceover, A1 song, A2.. sound effects). */
export const JCUT_LANE = 'A20';

type HeardBase = { startFrame: number; item: { name?: string; src?: string; sourceAssetId?: string; srcInFrame?: number; playbackRate?: number; volume?: number } };

/**
 * The lead-in of a J-cut: the first heard clip's own sound for the JCUT_SEC before its cut, from the source just before
 * its in-point, fading up to the clip's level, so the cut lands inside a sound already playing (editors' oldest trick for
 * a cut nobody notices). Null when the cut is at the reel start, the source has nothing before the in-point, or the
 * footage plays at another speed.
 */
export function jCutLeadIn(first: HeardBase, fps: number, id: string): { type: 'add'; startFrame: number; item: Record<string, unknown> } | null {
  const lead = Math.round(JCUT_SEC * fps);
  const it = first.item;
  const srcIn = (it.srcInFrame ?? 0) - lead;
  if (lead < 2 || first.startFrame < lead || srcIn < 0 || !it.src || (it.playbackRate ?? 1) !== 1) return null;
  const gain = it.volume ?? 1;
  return {
    type: 'add', startFrame: first.startFrame - lead,
    item: {
      id, track: JCUT_LANE, kind: 'audio', name: `${it.name ?? 'clip'} (sound first)`, src: it.src, ...(it.sourceAssetId ? { sourceAssetId: it.sourceAssetId } : {}),
      srcInFrame: srcIn, durationInFrames: lead, volume: gain, keyframes: { volume: [{ frame: 0, value: 0 }, { frame: lead, value: gain }] }, props: { rsJcut: true },
    },
  };
}

/** The clip a lead-in runs into: its sound carries on from it, so it starts at its level instead of ramping up at the cut. */
export function continuingSound<T extends { volume?: number; keyframes?: Record<string, unknown> }>(item: T): T {
  const kfs = item.keyframes?.volume as Array<{ frame: number; value: number }> | undefined;
  if (!kfs?.length) return item;
  return { ...item, keyframes: { ...item.keyframes, volume: kfs.map((k, i) => (i === 0 ? { ...k, value: item.volume ?? 1 } : k)) } };
}

/** A clip with its sound on (at `gain`, RS-1258 levelling), ramped in and out over a few frames so the cut does not click. */
export function heardClip<T extends { durationInFrames: number }>(item: T, gain = 1): T {
  const d = item.durationInFrames;
  const ramp = Math.min(3, Math.floor(d / 4));
  const kf = (item as { keyframes?: Record<string, unknown> }).keyframes;
  const g = Math.max(0, Math.min(2, gain));
  return { ...item, volume: g, ...(ramp > 0 ? { keyframes: { ...(kf ?? {}), volume: [{ frame: 0, value: 0 }, { frame: ramp, value: g }, { frame: d - ramp, value: g }, { frame: d, value: 0 }] } } : {}) };
}
