// RS-1217: a reference reel the user wants theirs to feel like. With no reference the agent falls back on its own
// defaults, which is why one-prompt reels look alike. The watch stage measures the reference with the same clip
// analysis as the footage (shot cuts, motion, mean colour, exposure) and the treatment writes a style guide from it; the
// critique then holds the built reel to the measured pace. Its subjects, words and logos are never copied.
import type { ClipFeatures } from '../assembler/scoring';
import type { ShotLogClip } from './shotLog';

export interface ReferenceProfile {
  name: string;
  seconds: number;
  shots: number;
  /** seconds between cuts */
  avgShotSec: number;
  medianShotSec: number;
  shortestSec: number;
  /** its motion against the user's footage */
  motion: 'calmer than your footage' | 'about as lively as your footage' | 'livelier than your footage';
  palette: { mean: string; words: string[] };
  /** shot starts in seconds, for the reference sheet */
  shotStarts: number[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };
const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');

/** Colour in words a style guide can use: warm/cool, bright/dark, muted/rich. */
export function paletteWords(c: { r: number; g: number; b: number }): string[] {
  const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const sat = max > 0 ? (max - min) / max : 0;
  const warmth = c.r - c.b;
  return [
    warmth > 0.06 ? 'warm' : warmth < -0.04 ? 'cool' : 'neutral',
    luma < 0.28 ? 'dark' : luma > 0.6 ? 'bright' : 'mid-tone',
    sat < 0.15 ? 'muted' : sat > 0.4 ? 'rich colour' : 'natural colour',
  ];
}

/** Looks that carry each palette word (a suggestion; the agent chooses). */
export const LOOKS_FOR: Record<string, string[]> = {
  warm: ['golden-hour', 'cinematic-travel', 'old-film'],
  cool: ['moody-bleach', 'neon-night'],
  dark: ['moody-bleach', 'neon-night'],
  muted: ['moody-bleach', 'old-film', 'soft-pastel'],
  'rich colour': ['cinematic-travel', 'riso-zine', 'comic-pop'],
};

export function referenceProfile(name: string, seconds: number, features: ClipFeatures, fps: number, footage: readonly ShotLogClip[]): ReferenceProfile {
  const cuts = [...new Set((features.shotBoundariesFrame ?? []).map((f) => f / fps).filter((t) => t > 0.1 && t < seconds - 0.1))].sort((a, b) => a - b);
  const starts = [0, ...cuts];
  const lengths = starts.map((t, i) => (starts[i + 1] ?? seconds) - t);
  const motionOf = (ws: ClipFeatures['windows']) => median(ws.map((w) => w.motion));
  const mine = motionOf(features.windows);
  const theirs = median(footage.flatMap((c) => (c.features?.windows ?? []).map((w) => w.motion)));
  const motion = !theirs ? 'about as lively as your footage' as const : mine > theirs * 1.4 ? 'livelier than your footage' as const : mine < theirs / 1.4 ? 'calmer than your footage' as const : 'about as lively as your footage' as const;
  const c = features.color ?? { r: 0.5, g: 0.5, b: 0.5 };
  return {
    name, seconds: r1(seconds), shots: starts.length, avgShotSec: r1(seconds / starts.length), medianShotSec: r1(median(lengths)), shortestSec: r1(Math.min(...lengths)),
    motion, palette: { mean: `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`, words: paletteWords(c) }, shotStarts: starts.map(r1),
  };
}

/** The measurements in one line for the agent, with the pace in beats of the chosen song. */
export function referenceLine(p: ReferenceProfile, bpm?: number): string {
  const beats = bpm ? ` (about ${r1(p.medianShotSec / (60 / bpm))} beats a shot at ${bpm} bpm)` : '';
  return `"${p.name}": ${p.seconds} s, ${p.shots} shots, a new shot every ${p.medianShotSec} s (median; mean ${p.avgShotSec} s, fastest ${p.shortestSec} s)${beats}; motion ${p.motion}; colour ${p.palette.words.join(', ')} (mean ${p.palette.mean}).`;
}

export interface ReferenceFinding { issue: string; fix: string }

/**
 * The built reel against the reference: its median shot length (from the timeline's cuts) and its look. Pace is the
 * thing people feel first; a reel cutting every 2.5 s against a reference cutting every 0.8 s does not feel like it.
 */
export function checkAgainstReference(p: ReferenceProfile, built: { shotSec: number[]; look?: string; sectionLooks: string[] }): ReferenceFinding[] {
  const out: ReferenceFinding[] = [];
  const mine = median(built.shotSec);
  if (mine && p.medianShotSec) {
    if (mine > p.medianShotSec * 1.6) out.push({ issue: `your reel changes shot every ${r1(mine)} s (median); the reference every ${p.medianShotSec} s`, fix: 'cut faster: cuts every 1 beat, flash-cuts or break-in in the journey, shorter holds (keep one hold for the line that needs reading)' });
    else if (mine < p.medianShotSec / 1.6) out.push({ issue: `your reel changes shot every ${r1(mine)} s (median); the reference lets shots breathe (${p.medianShotSec} s)`, fix: 'fewer, longer shots: cuts every 2-4 beats, holds on the best moments, slower moves' });
  }
  const wanted = [...new Set(p.palette.words.flatMap((w) => LOOKS_FOR[w] ?? []))];
  const looks = [built.look, ...built.sectionLooks].filter((x): x is string => !!x);
  if (wanted.length && !looks.length && p.palette.words.some((w) => w !== 'neutral' && w !== 'mid-tone' && w !== 'natural colour')) {
    out.push({ issue: `the reference is ${p.palette.words.join(', ')}; your reel has no look and keeps the footage as shot`, fix: `pick a look that carries it (${wanted.slice(0, 3).join(', ')}) if the footage suits it (check each look's avoid)` });
  }
  return out;
}
