// RS-204: choose B-roll by what the sentence is about, not only by clip score. Local and deterministic: a small
// English + Hinglish/Hindi word list maps a sentence to shot tags, and each B-roll slot takes the spare clip whose tags
// fit best. Clips without tags (or sentences without a known word) fall back to the plain score order.
import type { ShotTag } from '../shotTags';
import { tagFit } from './casting';
import type { AssemblyClip } from './types';

const WORDS: Record<ShotTag, string[]> = {
  scenery: ['mountain', 'mountains', 'view', 'sky', 'hill', 'hills', 'nature', 'trek', 'valley', 'sunrise', 'sunset', 'forest', 'pahad', 'पहाड़', 'नज़ारा', 'जंगल'],
  people: ['friends', 'everyone', 'group', 'team', 'together', 'gang', 'crew', 'family', 'dost', 'doston', 'sab', 'sabhi', 'दोस्त', 'दोस्तों', 'सब'],
  portrait: ['selfie', 'face', 'myself', 'vlog', 'ft'],
  action: ['run', 'ran', 'running', 'walk', 'walked', 'walking', 'climb', 'climbed', 'climbing', 'jump', 'jumped', 'jumping', 'hike', 'hiked', 'hiking', 'workout', 'gym', 'chal', 'daud', 'चल', 'दौड़', 'जिम'],
  food: ['eat', 'eating', 'food', 'coffee', 'chai', 'lunch', 'dinner', 'breakfast', 'pizza', 'snack', 'khana', 'khane', 'खाना', 'चाय'],
  detail: ['look', 'tiny', 'detail', 'closer', 'notice', 'dekho', 'देखो'],
  city: ['street', 'city', 'market', 'mall', 'building', 'temple', 'bazaar', 'shop', 'traffic', 'sheher', 'बाज़ार', 'शहर', 'मंदिर'],
  water: ['beach', 'sea', 'ocean', 'river', 'lake', 'waterfall', 'rain', 'swim', 'pool', 'pani', 'nadi', 'samundar', 'पानी', 'नदी', 'समुद्र', 'बारिश'],
  night: ['night', 'party', 'lights', 'fireworks', 'club', 'raat', 'रात', 'पार्टी'],
  laughing: ['funny', 'laugh', 'laughing', 'lol', 'haha', 'joke', 'hasi', 'mazak', 'mazaak', 'हंसी', 'मज़ाक', 'मजा', 'मज़ा'],
  shouting: ['scream', 'shout', 'yell', 'crazy', 'omg', 'insane', 'chilla', 'pagal', 'पागल', 'चिल्ला'],
  falling: ['fall', 'fell', 'falling', 'slip', 'slipped', 'fail', 'failed', 'crash', 'oops', 'gir', 'gira', 'girna', 'गिर', 'गिरा'],
  dancing: ['dance', 'dancing', 'danced', 'naach', 'nach', 'music', 'नाच', 'डांस'],
  celebrating: ['win', 'won', 'summit', 'top', 'cheer', 'celebrate', 'celebrating', 'finally', 'made', 'jeet', 'jeeta', 'जीत', 'आखिरकार'],
  posing: ['pose', 'posing', 'photo', 'pic', 'outfit', 'fit', 'drip', 'फोटो'],
};

const INDEX = new Map<string, ShotTag[]>();
for (const [tag, words] of Object.entries(WORDS) as Array<[ShotTag, string[]]>) {
  for (const w of words) INDEX.set(w, [...(INDEX.get(w) ?? []), tag]);
}

/** Shot tags a sentence is about, most-mentioned first. Empty when no known word appears. */
export function tagsForSentence(text: string): ShotTag[] {
  const hits = new Map<ShotTag, number>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
    for (const tag of INDEX.get(raw) ?? []) hits.set(tag, (hits.get(tag) ?? 0) + 1);
  }
  return [...hits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/** A clip must fit the sentence's tags at least this much to be chosen for its meaning. */
const FIT = 0.25;

export interface BrollMatch { picks: AssemblyClip[]; matched: number; note: string }

/**
 * One clip per slot, never repeating. `ranked` is the plain score order (best first) and is the fallback for slots
 * with no matching clip or no known word. Slots are filled in order, so earlier sentences get first pick.
 */
export function matchBroll(sentences: readonly string[], ranked: readonly AssemblyClip[]): BrollMatch {
  const left = [...ranked];
  const picks: AssemblyClip[] = [];
  let matched = 0;
  for (const text of sentences) {
    if (!left.length) break;
    const tags = tagsForSentence(text);
    let best = -1;
    let bestFit = FIT;
    if (tags.length && left.some((c) => c.shot)) {
      left.forEach((c, i) => {
        const fit = tagFit(c, tags);
        if (fit > bestFit) { bestFit = fit; best = i; }
      });
    }
    if (best >= 0) matched += 1; else best = 0;
    picks.push(left.splice(best, 1)[0]!);
  }
  return {
    picks, matched,
    note: matched ? `B-roll: ${matched} of ${picks.length} cutaways chosen by what is being said` : '',
  };
}
