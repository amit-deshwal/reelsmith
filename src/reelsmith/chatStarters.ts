// Reel starters for the empty chat (replace upstream's general workflows in ChatOnboarding).
import type { IconName } from '../components/icons';

export interface ReelStarter {
  readonly label: string;
  readonly description: string;
  /** Put in the composer for the user to finish or send. */
  readonly prompt: string;
  readonly icon: IconName;
}

export const REEL_STARTERS: readonly ReelStarter[] = [
  { label: 'Direct a reel', description: 'Your footage and song, cut to a story', prompt: 'Direct a reel from my footage and song. The story: ', icon: 'film' },
  { label: 'Add captions', description: 'Transcribe the speech, reel-style captions', prompt: 'Transcribe the speech and add reel-style captions.', icon: 'captions' },
  { label: 'Tighten the cut', description: 'Trim slow shots, keep it on the beat', prompt: 'Tighten the reel: trim slow shots and dead moments, keep the cuts on the beat.', icon: 'scissors' },
];
