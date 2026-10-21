// RS-1221: things the story names that the footage may not show. A line about "the waterfall" over a shot of a road
// tells the viewer the reel is lying; the right move is a one-line question to the user, not a convincing stand-in.
// Words map to the shot tags the visual model scores every clip on (shotTags.ts); only what those tags can see is
// checked, and only when most clips were tagged.
import type { ShotTag } from '../shotTags';
import { SHOT_TAG_INFO } from '../shotTags';
import type { ShotLogClip } from './shotLog';

const THINGS: Array<[RegExp, ShotTag[]]> = [
  [/^(waterfalls?|beach(es)?|sea|ocean|lake|river|swim(ming)?|pool|waves|boat(ing)?|kayak(ing)?|rafting)$/, ['water']],
  [/^(food|dinner|lunch|breakfast|maggi|chai|coffee|cooked|cooking|ate|eating|biryani|pizza|cake|meal|feast)$/, ['food']],
  [/^(campfire|bonfire|fireworks|stars|nightlife|night)$/, ['night']],
  [/^(city|streets?|temples?|forts?|markets?|buildings?|cafes?)$/, ['city']],
  [/^(dance[ds]?|dancing)$/, ['dancing']],
  [/^(fell|fall(ing)?|slipped|slip(ping)?)$/, ['falling']],
  [/^(laugh(ed|ing)?)$/, ['laughing']],
  [/^(cheer(ed|ing)?|celebrat(e|ed|ing))$/, ['celebrating']],
];

/** A tag score this low on every clip means none of them shows it (the log names tags from 0.18). */
const SHOWN = 0.1;

export interface MissingThing { word: string; tags: ShotTag[] }

/** Words of the story the tagged footage does not seem to show; nothing when too few clips were tagged to tell. */
export function missingThings(story: string, clips: readonly ShotLogClip[]): MissingThing[] {
  const tagged = clips.filter((c) => c.tags);
  if (!tagged.length || tagged.length < clips.length * 0.6) return [];
  const out: MissingThing[] = [];
  const seen = new Set<ShotTag>();
  for (const word of story.toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
    const hit = THINGS.find(([re]) => re.test(word));
    if (!hit || hit[1].some((t) => seen.has(t))) continue;
    hit[1].forEach((t) => seen.add(t));
    if (!tagged.some((c) => hit[1].some((t) => c.tags!.top === t || (c.tags!.scores[t] ?? 0) >= SHOWN))) out.push({ word, tags: hit[1] });
  }
  return out;
}

export const missingThingQuestion = (m: MissingThing) =>
  `Your story mentions "${m.word}" but I can't find it in the clips (no ${m.tags.map((t) => SHOT_TAG_INFO[t].label).join(' / ')} shot). Is it in one of them, or should I leave it out?`;
