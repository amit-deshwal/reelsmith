// RS-1204: sound effects for a directed reel, from the editor's built-in sound library (src/audio/soundLibrary.ts). The
// compiler reports what happens where (a whip into a new section, flash cuts, a punch on the drop, a build into the next
// section); this file picks a sound for each, lines up the loudest moment of the sound with the cut, spaces them out so
// the reel never turns into a sound board, and lays them on audio lanes under the song.
import type { AtomicAction } from '../../editor/reducerActions';
import { SOUND_EFFECTS, soundEffectSrc } from '../../audio/soundLibrary';

/** What happens at a frame: a cut that moves (whoosh), a flash or photo landing (shutter), a hit, a glitch, or a build that ends here (riser). */
export type SfxCue = 'whoosh' | 'whoosh-heavy' | 'whoosh-soft' | 'shutter' | 'hit' | 'glitch' | 'riser' | 'pop' | 'scratch'
  | 'ping' | 'message' | 'chime' | 'ding' | 'click';
export type SfxLevel = 'auto' | 'subtle' | 'off';
export const SFX_LEVELS: readonly SfxLevel[] = ['auto', 'subtle', 'off'];

export interface SfxEvent { frame: number; cue: SfxCue; /** a sound the plan named for this moment; always kept */ soundId?: string }

/**
 * The sound for each cue, how loud it should sit in the mix (mean level in dBFS; a song mastered for Reels averages about
 * -12) and how much it matters when two land together. The library files are recorded at very different levels, so the
 * gain comes from each file's measured level (SOUND_LEVELS), not a fixed number per cue.
 */
const CUES: Record<SfxCue, { sound: string; meanDb: number; rank: number }> = {
  hit: { sound: 'deep-impact-hit', meanDb: -16, rank: 5 },
  riser: { sound: 'sharp-bass-riser', meanDb: -19, rank: 4 },
  'whoosh-heavy': { sound: 'deep-short-whoosh', meanDb: -19, rank: 3 },
  whoosh: { sound: 'simple-whoosh', meanDb: -19, rank: 3 },
  'whoosh-soft': { sound: 'airy-short-whoosh', meanDb: -21, rank: 2 },
  glitch: { sound: 'tv-switch-off-noise', meanDb: -21, rank: 2 },
  scratch: { sound: 'record-scratch-stop', meanDb: -18, rank: 2 },
  shutter: { sound: 'short-shutter-click', meanDb: -21, rank: 1 },
  pop: { sound: 'tiny-bubble-pop', meanDb: -23, rank: 1 },
  // RS-1213: the director's graphics (a notification lands, a chat bubble arrives, a countdown ticks, a bar completes)
  chime: { sound: 'success-chime', meanDb: -20, rank: 3 },
  ping: { sound: 'phone-notification-ping', meanDb: -20, rank: 2 },
  ding: { sound: 'clean-ding', meanDb: -21, rank: 2 },
  message: { sound: 'sent-message-ping', meanDb: -21, rank: 1 },
  click: { sound: 'crisp-ui-click', meanDb: -25, rank: 1 },
};

/** Measured mean and peak (dBFS) of the cue sounds (ffmpeg volumedetect on assets/sound-effects). */
export const SOUND_LEVELS: Record<string, { mean: number; peak: number }> = {
  'deep-impact-hit': { mean: -14.1, peak: 0 },
  'sharp-bass-riser': { mean: -20.2, peak: -4.6 },
  'deep-short-whoosh': { mean: -21.5, peak: -4.1 },
  'simple-whoosh': { mean: -26.1, peak: -10 },
  'airy-short-whoosh': { mean: -23.6, peak: -2 },
  'tv-switch-off-noise': { mean: -17.2, peak: -2.9 },
  'record-scratch-stop': { mean: -18.5, peak: -2.3 },
  'short-shutter-click': { mean: -29, peak: -6.5 },
  'tiny-bubble-pop': { mean: -19.4, peak: -1.3 },
  'success-chime': { mean: -15.2, peak: -0.6 },
  'phone-notification-ping': { mean: -17.5, peak: -5.6 },
  'clean-ding': { mean: -24.4, peak: -9 },
  'sent-message-ping': { mean: -20.8, peak: -9.8 },
  'crisp-ui-click': { mean: -15.3, peak: 0 },
};
/** the editor's clip volume tops out at 2 (+6 dB) */
const MAX_GAIN_DB = 6;

/** Clip volume that brings a sound to `meanDb`, never past -1 dBFS at its peak; unmeasured (hand-placed) sounds play at 0.8. */
export function soundVolume(soundId: string, meanDb: number): number {
  const lv = SOUND_LEVELS[soundId];
  if (!lv) return 0.8;
  const db = Math.min(meanDb - lv.mean, -1 - lv.peak, MAX_GAIN_DB);
  return Math.round(10 ** (db / 20) * 1000) / 1000;
}

export const isSfxCue = (x: string): x is SfxCue => x in CUES;

/** The cue a transition into a section asks for (null = silent). */
export const TRANSITION_CUES: Record<string, SfxCue | null> = {
  crossfade: null, dipToBlack: null, dipToWhite: 'whoosh-soft', flash: 'shutter', slideLeft: 'whoosh', zoomIn: 'whoosh-heavy',
  'zoom-through': 'whoosh-heavy', 'whip-blur': 'whoosh', 'spin-zoom': 'whoosh-heavy', bars: 'shutter', 'wide-bars': 'shutter', window: 'whoosh-soft',
  'light-leak': null, 'chroma-glitch': 'glitch', 'fluted-glass': 'whoosh-soft', 'ripple-dissolve': null, 'tile-pop': 'pop', 'cube-turn': 'whoosh', 'slide-over': 'whoosh',
  pixelate: 'glitch', 'film-burn': 'whoosh-soft', 'flip-3d': 'whoosh', 'mirror-flip': 'whoosh-soft', 'prism-flash': 'whoosh-soft', 'brush-wipe': 'whoosh-soft',
  'blur-focus': null, 'radial-blur': 'whoosh-heavy', 'page-curl': 'whoosh-soft', 'circle-wipe': 'pop', 'light-dissolve': null, 'impact-shake': 'hit',
  'glitch-cut': 'glitch', 'line-wipe': 'whoosh-soft', 'luma-blend': null,
};


/** The short library sounds offered to the director for hand-placed moments. */
export const DIRECTOR_SOUNDS = SOUND_EFFECTS
  .filter((s) => s.seconds <= 4.5 && ['transition-emphasis', 'device-texture', 'reaction-mood', 'ui-motion-feedback'].includes(s.group) && !/loop|ringtone|keyboard|tick/.test(s.id))
  .map((s) => ({ id: s.id, name: s.name, seconds: Math.round(s.seconds * 10) / 10 }));

/** Seconds from the start of a library sound to its loudest moment, so that moment can sit on the cut. */
export function soundPeakSec(id: string): number {
  const s = SOUND_EFFECTS.find((x) => x.id === id);
  if (!s?.peaks.length) return 0;
  let best = 0;
  s.peaks.forEach((p, i) => { if (p > s.peaks[best]!) best = i; });
  return ((best + 0.5) / s.peaks.length) * s.seconds;
}

export const isLibrarySound = (id: string) => SOUND_EFFECTS.some((s) => s.id === id);

/**
 * Audio items for the events: a riser ends on its frame, every other sound peaks on it. Events closer than `gapSec` to a
 * louder one are dropped, and shutters/pops (which come in runs on flash cuts) at most one every `runGapSec`.
 */
export function sfxActions(events: SfxEvent[], opts: { fps: number; total: number; level: SfxLevel; id: (...p: Array<string | number>) => string; gapSec?: number; runGapSec?: number }): AtomicAction[] {
  if (opts.level === 'off' || !events.length) return [];
  const { fps } = opts;
  const gap = Math.round((opts.gapSec ?? 0.3) * fps);
  const runGap = Math.round((opts.runGapSec ?? 0.45) * fps);
  // strongest first, so a hit wins over a shutter on the same cut
  const ranked = [...events].filter((e) => e.frame >= 0 && e.frame <= opts.total)
    .sort((a, b) => Number(!!b.soundId) - Number(!!a.soundId) || CUES[b.cue].rank - CUES[a.cue].rank || a.frame - b.frame);
  const kept: SfxEvent[] = [];
  // a riser plays before its frame and everything else peaks on it, so a riser into a hit or whoosh is a pair, not a clash
  const clash = (a: SfxEvent, b: SfxEvent) => (a.cue === 'riser') === (b.cue === 'riser') && Math.abs(a.frame - b.frame) < gap;
  for (const e of ranked) {
    if (e.soundId) { kept.push(e); continue; }
    const light = CUES[e.cue].rank <= 1;
    if (kept.some((k) => clash(k, e) || (light && CUES[k.cue].rank <= 1 && Math.abs(k.frame - e.frame) < runGap))) continue;
    kept.push(e);
  }
  kept.sort((a, b) => a.frame - b.frame);
  const lanes: number[] = []; // end frame of the last sound on each lane
  const out: AtomicAction[] = [];
  kept.forEach((e, n) => {
    const cue = CUES[e.cue];
    const soundId = e.soundId && isLibrarySound(e.soundId) ? e.soundId : cue.sound;
    const sound = SOUND_EFFECTS.find((s) => s.id === soundId)!;
    const len = Math.max(1, Math.round(sound.seconds * fps));
    const anchor = e.cue === 'riser' ? len : Math.round(soundPeakSec(soundId) * fps);
    let start = e.frame - anchor;
    let srcIn = 0;
    if (start < 0) { srcIn = -start; start = 0; } // a sound before the reel starts is trimmed, not shifted
    const dur = Math.min(len - srcIn, opts.total - start);
    if (dur < 2) return;
    let lane = lanes.findIndex((end) => end <= start);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = start + dur;
    const volume = soundVolume(soundId, cue.meanDb + (opts.level === 'subtle' ? -6 : 0));
    out.push({
      type: 'add', startFrame: start,
      item: {
        id: opts.id('sfx', n), track: `A${2 + lane}`, kind: 'audio', name: sound.name, src: soundEffectSrc(soundId), durationInFrames: dur,
        ...(srcIn ? { srcInFrame: srcIn } : {}), volume, props: { rsSfx: e.cue },
      },
    } as AtomicAction);
  });
  return out;
}
