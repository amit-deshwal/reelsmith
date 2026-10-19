// The chat request the Director box sends (RS-1201): the user's story and shape; the agent does the rest with the
// reels-director skill. The story is quoted as the user's words, never as instructions to follow.
import type { RatioId } from '../../../shared/reelsmith/ratios';

export const STORY_MAX = 600;

export function directorPrompt(story: string, ratio: RatioId): string {
  const text = story.replace(/\s+/g, ' ').trim().slice(0, STORY_MAX);
  return [
    `Direct a ${ratio} reel from my imported clips, photos and song (director mode).`,
    text ? `My story, in my words: "${text}"` : 'I have not written a story: ask me for one line about it first.',
    'Use the reels-director skill: reels_director_options (it includes contact sheets of every clip), then one plan and reels_director_build. Keep my words on screen; describe only what the clips show.',
  ].join('\n');
}
