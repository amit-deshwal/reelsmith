// The chat request the Director box sends (RS-1201): the user's story and shape; the agent does the rest with the
// reels-director skill. The story is quoted as the user's words, never as instructions to follow.
import type { RatioId } from '../../../shared/reelsmith/ratios';

export const STORY_MAX = 6000;

/**
 * `songs` is how many songs the user imported. The sound line must match: a conditional "with no song imported, keep the
 * clips' own sound" sent with a song imported read as an order, and the agent left the user's song out.
 */
/** RS-1239: a web address in the story ("promo reel for punetrekkers.org"), for the brand kit. */
export function storySite(story: string): string | undefined {
  return /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|org|net|in|co|io|club|app|me|studio|cafe|shop|store|travel|fit|life)(?:\/[^\s"]*)?(?=[\s,.!?)"]|$)/i.exec(story)?.[0];
}

export function directorPrompt(story: string, ratio: RatioId, songs = 0, reference?: { id: string; name: string }, askFirst = false): string {
  const text = story.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, STORY_MAX);
  return [
    `Direct a ${ratio} reel from the media I imported (director mode). Use what is there; ${songs ? `put it to the song I imported${songs > 1 ? ' (pick the one that fits the story)' : ''}. If an imported audio file is my own voiceover (stage 1 lists it under voiceovers), it leads the reel whole, with captions: never cut it, turn it down or use it as the song.` : 'no song is imported, so keep the clips\' own sound.'}`,
    text ? `My story, in my words: "${text}"` : 'I have not written a story: ask me for one line about it first.',
    // RS-1217: the reference is named by id so the agent passes it to stage 1; it is never footage
    ...(reference ? [`Make it feel like my reference reel "${reference.name.replace(/"/g, '')}" (assetId ${reference.id}): pass it as reference to reels_director_options. Match its pace and look; it is not footage, and copy nothing of its content.`] : []),
    // RS-1239: a promo reel's page is read once in stage 1 for its words, action and colours
    ...(storySite(text) ? [`It is a promo reel for ${storySite(text)}: pass it as brandUrl to reels_director_options and end on its call to action.`] : []),
    // RS-1230: the approval gate; the tools enforce it, this line turns it on
    ...(askFirst ? ['Show me the plan first: pass askFirst true to reels_director_options, and after reels_director_treatment show me its card and wait for my go before you build.'] : []),
    'Use the reels-director skill and its four stages: reels_director_options (the shot log, contact sheets and, with find, the shots for my story), reels_director_treatment, reels_director_build (its first build brings the critique), then reels_director_fix for its largest defects. I want the best cut possible, not a template. Keep my words on screen; describe only what the clips show.',
  ].join('\n');
}

/** RS-1233: the "also as 4:5" buttons; the reel itself comes from the open timeline's saved run. */
export function reshapePrompt(ratio: RatioId): string {
  return `Make a ${ratio} version of my directed reel with reels_director_reshape (ratio ${ratio}): same story and shots, laid out for ${ratio}. Check its frames, fix anything that does not fit, and keep my first version as it is.`;
}
