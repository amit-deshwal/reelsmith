// The words the "Text behind you" effect can write (an effect's settings are numbers, so the word is picked by index).
// Pure, no DOM: the canvas that draws the word is in textLayer.ts.
export const BEHIND_WORDS = [
  'WANDERLUST', 'SUMMER', 'GOOD VIBES', 'MAIN CHARACTER', 'ESCAPE', 'LOVE', 'WEEKEND', 'ADVENTURE', 'DREAM BIG', 'GOLDEN HOUR',
  'NEW CHAPTER', 'HOME', 'FOREVER', 'LET’S GO',
] as const;

/** the effect's `word` setting (0-based) -> the word, wrapping out-of-range values to the nearest end */
export function behindWord(index: number): string {
  const i = Math.min(BEHIND_WORDS.length - 1, Math.max(0, Math.round(Number.isFinite(index) ? index : 0)));
  return BEHIND_WORDS[i]!;
}
