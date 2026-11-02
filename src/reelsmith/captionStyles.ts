// RS-502: the Reels caption styles. Each is an upstream caption template plus a style override, a motion
// preset and a placement that keeps the block above Instagram's caption/buttons area (bottom ~19% of the frame).
import type { CaptionStyleOverride } from '../captions/styles';
import type { CaptionLayout, CaptionMotionPreset, CaptionPacing, CaptionTemplate, CaptionsData } from '../captions/types';
import { DEFAULT_SAFE_ZONE } from './safeZone';

export type ReelsCaptionStyleId = 'clean-white' | 'highlight-word' | 'boxed' | 'karaoke' | 'pop-word' | 'minimal-lower' | 'behind-speaker' | 'lyrics-behind';

export interface ReelsCaptionStyle {
  id: ReelsCaptionStyleId;
  label: string;
  hint: string;
  template: CaptionTemplate;
  pacing: CaptionPacing;
  motionPreset: CaptionMotionPreset;
  styleOverride: CaptionStyleOverride;
  layout: CaptionLayout;
  /** the words sit behind the person in the shot (CaptionsData.rsBehind) */
  behind?: boolean;
}

/** Upstream captions sit 8% above the bottom; lift them so the block clears Instagram's bottom band. */
const ABOVE_IG_UI: CaptionLayout = { anchor: 'bottom-center', offsetYRatio: DEFAULT_SAFE_ZONE.bottomPx / 1920 + 0.04 - 0.08 };

export const REELS_CAPTION_STYLES: readonly ReelsCaptionStyle[] = [
  {
    id: 'clean-white', label: 'Clean white', hint: 'White words with a soft outline, a few at a time',
    template: 'bold-outline', pacing: 'phrase', motionPreset: 'fade-up',
    styleOverride: { fontFamily: 'Inter', fontWeight: 800, fontSize: 0.042, strokeWidth: 3, strokeColor: '#000000', textShadow: '0 2px 10px #000c', wordsPerPage: 4 },
    layout: ABOVE_IG_UI,
  },
  {
    id: 'highlight-word', label: 'Highlight active word', hint: 'The spoken word turns yellow',
    template: 'story', pacing: 'phrase', motionPreset: 'none',
    styleOverride: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 0.046, textTransform: 'uppercase', highlightColor: '#FFD84A', strokeWidth: 2, wordsPerPage: 3, displayMode: 'inline' },
    layout: ABOVE_IG_UI,
  },
  {
    id: 'boxed', label: 'Boxed', hint: 'Whole line on a dark rounded box',
    template: 'black-bar', pacing: 'phrase', motionPreset: 'fade-up',
    styleOverride: { fontFamily: 'Inter', fontWeight: 700, fontSize: 0.038, background: '#000000', backgroundOpacity: 0.72, boxBorderRadius: 14, wordsPerPage: 6 },
    layout: ABOVE_IG_UI,
  },
  {
    id: 'karaoke', label: 'Karaoke sweep', hint: 'Words light up one by one as they are spoken',
    template: 'tiktok', pacing: 'phrase', motionPreset: 'karaoke-pulse',
    styleOverride: { fontFamily: 'Poppins', fontWeight: 800, fontSize: 0.044, highlightBackground: '#00C2FF', highlightColor: '#ffffff', wordsPerPage: 4, displayMode: 'inline' },
    layout: ABOVE_IG_UI,
  },
  {
    id: 'pop-word', label: 'Pop word', hint: 'One or two big words that pop in',
    template: 'bubble-pop', pacing: 'word', motionPreset: 'word-pop',
    styleOverride: { fontSize: 0.085, wordsPerPage: 2, displayMode: 'inline' },
    layout: { anchor: 'middle-center', offsetYRatio: 0.12 },
  },
  {
    id: 'minimal-lower', label: 'Minimal lowercase', hint: 'Small, quiet, sentence-style text',
    template: 'plain', pacing: 'phrase', motionPreset: 'fade-up',
    styleOverride: { fontFamily: 'Inter', fontWeight: 500, fontSize: 0.032, textTransform: 'lowercase', textShadow: '0 1px 6px #000b', wordsPerPage: 6 },
    layout: ABOVE_IG_UI,
  },
  {
    // From Cardboard's "Captions Behind" (2026-08-31): one or two huge words across the head, the person in front of them
    id: 'behind-speaker', label: 'Behind the speaker', hint: 'Big words that sit behind the person',
    template: 'plain', pacing: 'word', motionPreset: 'word-pop',
    styleOverride: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 0.12, textTransform: 'uppercase', textShadow: '0 4px 24px #0007', wordsPerPage: 2, displayMode: 'inline' },
    layout: { anchor: 'middle-center', offsetYRatio: -0.17 },
    behind: true,
  },
  {
    // RS-1253: the lyric-video look: each sung word alone, huge and heavy across the head, the singer in front of it
    id: 'lyrics-behind', label: 'Lyrics behind', hint: 'One huge sung word at a time, behind the person',
    template: 'plain', pacing: 'word', motionPreset: 'word-pop',
    styleOverride: { fontFamily: 'Anton', fontWeight: 400, fontSize: 0.19, textShadow: '0 6px 30px #0008', wordsPerPage: 1, displayMode: 'inline' },
    layout: { anchor: 'middle-center', offsetYRatio: -0.12 },
    behind: true,
  },
];

export function reelsCaptionStyle(id: string | undefined): ReelsCaptionStyle {
  return REELS_CAPTION_STYLES.find((s) => s.id === id) ?? REELS_CAPTION_STYLES[1]!;
}

/** The CaptionsData fields to set (or patch) for a Reels caption style. */
export function captionsFor(id: string | undefined): Pick<CaptionsData, 'template' | 'pacing' | 'motionPreset' | 'styleOverride' | 'layout' | 'rsBehind'> {
  const s = reelsCaptionStyle(id);
  return { template: s.template, pacing: s.pacing, motionPreset: s.motionPreset, styleOverride: { ...s.styleOverride }, layout: { ...s.layout }, rsBehind: s.behind === true };
}
