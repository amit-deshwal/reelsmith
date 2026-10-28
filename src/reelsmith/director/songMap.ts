// RS-1224: the song as an editor hears it, not only its beats and one drop. Editing guides agree on two things a beat
// grid alone cannot give: shot length follows the music (longer shots while it is quiet, shorter as it builds, the
// fastest cuts where it is loudest), and changes land on the bar or the half bar, never on an odd beat. The song
// analysis already measures the loudness of every beat; this turns it into a level per bar for the agent, and checks a
// plan's pace and transitions against it.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';

export interface SongMap {
  /** loudness of each bar from the reel start, 1 (as quiet as the song's quiet parts) to 5 (as loud as its loud parts) */
  levels: number[];
  beatsPerBar: number;
}

/**
 * Levels for `bars` bars from beat `startIdx` (the reel's first beat), measured against every bar of the song so its
 * intro reads as quiet and its chorus as loud. Null when the song has too little analysis, or no quiet and loud parts.
 */
export function songMap(energyPerBeat: readonly number[] | undefined, startIdx: number, beatsPerBar: number, bars: number): SongMap | null {
  if (!energyPerBeat?.length || beatsPerBar < 1 || startIdx < 0) return null;
  const barMean = (from: number) => {
    const xs = energyPerBeat.slice(from, from + beatsPerBar);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
  };
  // every bar of the song, on the same bar lines as the reel
  const phase = startIdx % beatsPerBar;
  const all: number[] = [];
  for (let i = phase; i + beatsPerBar <= energyPerBeat.length; i += beatsPerBar) all.push(barMean(i));
  if (all.length < 4) return null;
  const sorted = [...all].sort((a, b) => a - b);
  const lo = sorted[0]!, hi = sorted[sorted.length - 1]!;
  // a flat song (a loop, a drone) has no quiet and loud parts to cut to
  if (hi <= 0 || (hi - lo) / hi < 0.15) return null;
  // 1 at its quiet parts, 5 at its loud parts: scaled between the 10th and 90th percentile bar (so one spike or one
  // silent bar does not squash the rest), or the extremes when most bars are alike
  let p10 = sorted[Math.floor(sorted.length * 0.1)]!, p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!;
  if (p90 - p10 < (hi - lo) * 0.25) { p10 = lo; p90 = hi; }
  const rank = (x: number) => Math.round(1 + 4 * Math.min(1, Math.max(0, (x - p10) / (p90 - p10))));
  const levels: number[] = [];
  for (let b = 0; b < bars; b += 1) {
    const m = barMean(startIdx + b * beatsPerBar);
    if (!Number.isFinite(m)) break;
    levels.push(rank(m));
  }
  return levels.length ? { levels, beatsPerBar } : null;
}

/** Where the song lifts: the first bars that jump two levels or more over the bar before (beats from the reel start). */
export function songLifts(m: SongMap): number[] {
  return m.levels.flatMap((v, b) => (b > 0 && v - m.levels[b - 1]! >= 2 ? [b * m.beatsPerBar] : []));
}

/** One line the agent reads: levels in groups of four bars (a phrase), and where the song lifts. */
export function songMapText(m: SongMap): string {
  const groups: string[] = [];
  for (let b = 0; b < m.levels.length; b += 4) groups.push(m.levels.slice(b, b + 4).join(' '));
  const lifts = songLifts(m);
  return `energy by bar from the reel start (1 quiet to 5 loudest; ${m.beatsPerBar} beats a bar, phrases of 4 bars): ${groups.join(' | ')}`
    + (lifts.length ? `; it lifts on beat ${lifts.slice(0, 3).join(', ')}` : '');
}

/** Mean level over beats [b0, b1) of the reel. */
export function levelOver(m: SongMap, b0: number, b1: number): number | undefined {
  const from = Math.max(0, Math.floor(b0 / m.beatsPerBar));
  const to = Math.min(m.levels.length, Math.ceil(b1 / m.beatsPerBar));
  const xs = m.levels.slice(from, Math.max(from + 1, to));
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined;
}

export interface PaceFinding { section: number; issue: string; fix: string }

/** Moves that cut faster than the beat, or punch on it. */
const FAST = new Set(['flash-cuts', 'zoom-punch', 'postcard-band']);
/** Moves that slow down or hold on purpose; a slow-motion slam on a loud bar is the point, not dead air. */
const HOLDS = new Set(['hold', 'photo-drift', 'photo-parallax', 'black']);

/**
 * The plan's pace against the song: fast cuts over its quiet bars feel unmotivated, a long hold over its loudest bars
 * reads as the edit stalling, and a transition on an odd beat sounds late. Sections are given in reel beats.
 */
export function paceFindings(plan: ReelPlan, beats: ReadonlyArray<{ b0: number; b1: number }>, m: SongMap): PaceFinding[] {
  const out: PaceFinding[] = [];
  const lifts = songLifts(m);
  const loudBars = m.levels.flatMap((v, b) => (v >= 4 ? [b * m.beatsPerBar] : []));
  const last = plan.sections.length - 1;
  plan.sections.forEach((s, k) => {
    const span = beats[k];
    if (!span) return;
    const level = levelOver(m, span.b0, span.b1);
    if (level === undefined) return;
    const every = typeof s.params?.every === 'number' ? s.params.every : 2;
    const fast = FAST.has(s.move) || (s.move === 'cut' && every <= 1);
    // the hook keeps its own rules (it may burst over a quiet intro to stop the scroll)
    if (k > 0 && fast && level <= 2) {
      const later = lifts.find((b) => b > span.b0) ?? loudBars.find((b) => b > span.b0);
      out.push({ section: k, issue: `section ${k} (${s.move}) cuts fast over a quiet stretch of the song (energy ${level.toFixed(1)} of 5, beats ${span.b0}-${span.b1}): the cuts feel unmotivated`, fix: `slow it here (cut every 2-4 beats, a hold, photo-drift)${later !== undefined ? ` and save the fast cuts for where the song lifts (beat ${later})` : ''}` });
    }
    const slow = HOLDS.has(s.move) || (s.move === 'cut' && every >= 4);
    if (k !== last && slow && level >= 4 && span.b1 - span.b0 > 4) {
      out.push({ section: k, issue: `section ${k} (${s.move}) holds for ${span.b1 - span.b0} beats over the loudest part of the song (energy ${level.toFixed(1)} of 5): the edit stalls while the music peaks`, fix: 'cut it on the beat (every 1-2 beats) or give it a peak move; let the holds sit on the quieter bars' });
    }
    // a change on the bar (or half bar) lands; one on an odd beat sounds late
    if (k > 0 && s.transition && Math.round(span.b0) % 2 === 1) {
      out.push({ section: k, issue: `the ${s.transition} into section ${k} lands on beat ${Math.round(span.b0)}, an odd beat: it sounds late`, fix: `move the section boundary to beat ${Math.round(span.b0) - 1} or ${Math.round(span.b0) + 1} (a bar line is strongest) by changing the beats of the sections before it` });
    }
  });
  return out;
}
