/** Phrase and energy guidance from the song's measured beat grid. All times are in the source song. */
import type { MusicAnalysis } from '../../audio/intelligence/types';

/** Prefer the Beat This result when music analysis has run; older cached analyses lack beat energy. */
export function beatThisSongGrid(analysis: MusicAnalysis): { beatTimesSec: number[]; downbeatIndex: number; energyPerBeat: number[]; durationSec: number; dropSec?: number; loudestStartSec?: number; beatsPerBar: number } | null {
  if (!analysis.beatEnergy || analysis.beatEnergy.length !== analysis.beatsMs.length || analysis.beatsMs.length < 2) return null;
  const beatTimesSec = analysis.beatsMs.map((ms) => ms / 1000);
  const downbeatIndex = analysis.downbeatsMs.length ? beatTimesSec.reduce((best, t, i) => Math.abs(t - analysis.downbeatsMs[0]! / 1000) < Math.abs(beatTimesSec[best]! - analysis.downbeatsMs[0]! / 1000) ? i : best, 0) : 0;
  const peak = analysis.sections.find((s) => s.role === 'peak');
  const loudest = analysis.sections.reduce((best, s) => s.energy > best.energy ? s : best, analysis.sections[0] ?? { fromMs: 0, energy: 0 });
  return { beatTimesSec, downbeatIndex, energyPerBeat: analysis.beatEnergy, durationSec: analysis.durationMs / 1000,
    ...(peak ? { dropSec: peak.fromMs / 1000 } : {}), loudestStartSec: loudest.fromMs / 1000, beatsPerBar: analysis.meter };
}

export interface PhraseGrid {
  firstStrongBeatSec: number;
  /** Four-bar and eight-bar boundaries, including their song time and beat relative to the proposed reel start. */
  fourBar: Array<{ songSec: number; reelBeat: number }>;
  eightBar: Array<{ songSec: number; reelBeat: number }>;
  /** Every four-bar boundary in the song, useful when the user chose a different song start. */
  songFourBarSec: number[];
  /** Energy for each beat of the proposed reel, 1 quiet to 5 loud. */
  energyByBeat: number[];
}

const hundredth = (n: number) => Math.round(n * 100) / 100;

export function phraseGrid(
  beatTimesSec: readonly number[], downbeatIndex: number, energyPerBeat: readonly number[] | undefined,
  startIdx: number, reelBeats: number, beatsPerBar = 4,
): PhraseGrid | null {
  if (beatTimesSec.length < 2 || !Number.isInteger(downbeatIndex) || downbeatIndex < 0 || downbeatIndex >= beatTimesSec.length
    || !Number.isInteger(startIdx) || startIdx < 0 || startIdx >= beatTimesSec.length || beatsPerBar < 1) return null;
  const boundary = (bars: number) => {
    const stride = bars * beatsPerBar;
    const first = downbeatIndex + Math.max(0, Math.ceil((startIdx - downbeatIndex) / stride)) * stride;
    const out: PhraseGrid['fourBar'] = [];
    for (let i = first; i < Math.min(beatTimesSec.length, startIdx + reelBeats + stride); i += stride) {
      out.push({ songSec: hundredth(beatTimesSec[i]!), reelBeat: i - startIdx });
    }
    return out;
  };
  const clean = (energyPerBeat ?? []).filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const lo = clean[Math.floor(clean.length * 0.1)] ?? 0;
  const hi = clean[Math.floor(clean.length * 0.9)] ?? lo;
  const energyByBeat = Array.from({ length: Math.min(reelBeats, beatTimesSec.length - startIdx) }, (_, k) => {
    const x = energyPerBeat?.[startIdx + k];
    return x === undefined || !Number.isFinite(x) || hi <= lo ? 3 : Math.max(1, Math.min(5, Math.round(1 + 4 * (x - lo) / (hi - lo))));
  });
  const songFourBarSec: number[] = [];
  for (let i = downbeatIndex; i < beatTimesSec.length; i += 4 * beatsPerBar) songFourBarSec.push(hundredth(beatTimesSec[i]!));
  return { firstStrongBeatSec: hundredth(beatTimesSec[downbeatIndex]!), fourBar: boundary(4), eightBar: boundary(8), songFourBarSec, energyByBeat };
}
