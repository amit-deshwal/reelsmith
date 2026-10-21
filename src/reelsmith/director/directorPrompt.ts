// The chat request the Director box sends (RS-1201): the user's story and shape; the agent does the rest with the
// reels-director skill. The story is quoted as the user's words, never as instructions to follow.
import type { RatioId } from '../../../shared/reelsmith/ratios';

export const STORY_MAX = 600;

/**
 * `songs` is how many songs the user imported. The sound line must match: a conditional "with no song imported, keep the
 * clips' own sound" sent with a song imported read as an order, and the agent left the user's song out.
 */
export function directorPrompt(story: string, ratio: RatioId, songs = 0, reference?: { id: string; name: string }): string {
  const text = story.replace(/\s+/g, ' ').trim().slice(0, STORY_MAX);
  return [
    `Direct a ${ratio} reel from the media I imported (director mode). Use what is there; ${songs ? `put it to the song I imported${songs > 1 ? ' (pick the one that fits the story)' : ''}.` : 'no song is imported, so keep the clips\' own sound.'}`,
    text ? `My story, in my words: "${text}"` : 'I have not written a story: ask me for one line about it first.',
    // RS-1217: the reference is named by id so the agent passes it to stage 1; it is never footage
    ...(reference ? [`Make it feel like my reference reel "${reference.name.replace(/"/g, '')}" (assetId ${reference.id}): pass it as reference to reels_director_options. Match its pace and look; it is not footage, and copy nothing of its content.`] : []),
    'Use the reels-director skill and its four stages: reels_director_options (the shot log and contact sheets), reels_director_treatment, reels_director_build, then reels_director_critique and reels_director_fix for its largest defects. I want the best cut possible, not a template; take the time it needs. Keep my words on screen; describe only what the clips show.',
  ].join('\n');
}
