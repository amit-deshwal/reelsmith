// RS-1271 (2): the director wrote no copy. Every line of the Goa reel was a phrase of the brief in caps ("GOA TRIP WITH
// THE BOYS", "BEACH CAFES AND THE SEA", "POOL JUMPS", "CLUBBING ALL NIGHT") and the kicker its lowercase "the red Thar
// road trip": the brief is a list of what the footage holds, not the words a creator puts on screen. A line that copies
// a run of the brief is sent back with "write the line". Phrases the user put in quotes are lines they asked for and
// may be used as written.

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'at', 'with', 'for', 'our', 'my', 'we', 'is', 'it', 'all', 'by', 'from']);

const tokens = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean);

/** The story in runs a line could copy: quoted phrases taken out, split at punctuation (a run never spans a comma). */
function storyRuns(story: string): string[][] {
  const unquoted = story.replace(/["“”«»][^"“”«»]*["“”«»]/g, ' | ');
  return unquoted.split(/[.,:;!?()\n|…—–]+|\s-\s/).map(tokens).filter((r) => r.length);
}

/** The phrases the user put in quotes: lines they asked for, word for word. */
export function quotedPhrases(story: string): string[] {
  return [...story.matchAll(/["“”«»]([^"“”«»]+)["“”«»]/g)].map((m) => m[1]!.trim()).filter(Boolean);
}

/**
 * The run of the story a line copies, or undefined: three or more words in a row with at least two that carry meaning.
 * Two words are left alone: "TWO DAYS" or "POOL JUMPS" may be a fact the user gave as much as a copied phrase. A line
 * the user quoted is theirs and never counts.
 */
export function copiedRun(line: string, story: string): string | undefined {
  const words = tokens(line);
  if (words.length < 3 || !story.trim()) return undefined;
  if (quotedPhrases(story).some((q) => tokens(q).join(' ') === words.join(' '))) return undefined;
  const runs = storyRuns(story).map((r) => ` ${r.join(' ')} `);
  const inStory = (ws: string[]) => runs.some((r) => r.includes(` ${ws.join(' ')} `));
  const meaningful = (ws: string[]) => ws.filter((w) => !STOP.has(w)).length;
  let best: string[] | undefined;
  for (let i = 0; i < words.length; i += 1) {
    for (let j = words.length; j - i >= 3; j -= 1) {
      const ws = words.slice(i, j);
      if (best && ws.length <= best.length) break;
      if (meaningful(ws) >= 2 && inStory(ws)) { best = ws; break; }
    }
  }
  return best?.join(' ');
}

/** "the red Thar road trip" → "write the line" finding text, shared by the treatment check and the plan rule. */
export const COPY_FIX = 'write the line: a short punchy line of your own on what the shot shows or the feeling of that moment (a hook that makes people stay, a joke, a claim, a kicker), in the user\'s language; names, places and numbers only as the user gave them. Put a phrase in quotes in the brief only when the user asked for those exact words';
