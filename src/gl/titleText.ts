// The titles the "Movie title reveal" effect can write (an effect's settings are numbers, so the title is picked by index).
// A line break stacks the title on two lines, which fills a portrait frame better than one long line.
// Pure, no DOM: the canvas that draws the title is in textLayer.ts.
export const TITLE_WORDS = [
  'THE LAST\nSUMMER', 'WANDER\nLUST', 'GOLDEN\nHOUR', 'THE\nJOURNEY', 'ESCAPE', 'NEW\nCHAPTER', 'GOOD\nVIBES', 'ADVENTURE',
  'THE GREAT\nESCAPE', 'ISLAND\nLIFE', 'ROAD\nTRIP', 'FOREVER\nYOUNG',
] as const;

/** the effect's `word` setting (0-based) -> the title, wrapping out-of-range values to the nearest end */
export function titleWord(index: number): string {
  const i = Math.min(TITLE_WORDS.length - 1, Math.max(0, Math.round(Number.isFinite(index) ? index : 0)));
  return TITLE_WORDS[i]!;
}

/** "THE LAST\nSUMMER" -> "the last summer" (for effect descriptions and the agent) */
export const titleLabel = (title: string): string => title.replace(/\n/g, ' ').toLowerCase();
