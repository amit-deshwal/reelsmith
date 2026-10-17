import type { Recipe } from './recipe';
import type { ReelsBrief } from './brief';

export interface TrendIdeaOptions {
  topic: string;
  availableClips: number;
  research: boolean;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

/** A useful offline starting point built only from recipe metadata and the user's topic. */
export function localIdeaBrief(recipe: Recipe, options: TrendIdeaOptions): ReelsBrief {
  const divisor = gcd(recipe.canvas.width, recipe.canvas.height);
  const clipInput = recipe.inputs.find((input) => input.kind === 'media' && input.accept.some((kind) => kind === 'video' || kind === 'image'));
  const audioInput = recipe.inputs.find((input) => input.kind === 'media' && input.accept.includes('audio'));
  const textInputs = recipe.inputs.filter((input) => input.kind === 'text' && !input.optional);
  const clips = clipInput?.kind === 'media' ? [{
    count: Math.max(1, Math.min(Math.floor(options.availableClips) || clipInput.min, clipInput.max)),
    shotType: 'any' as const,
    minLengthSec: clipInput.constraints?.minClipSec,
  }] : [];
  return {
    version: 1,
    target: { recipeId: recipe.id, ratio: `${recipe.canvas.width / divisor}:${recipe.canvas.height / divisor}` as ReelsBrief['target']['ratio'] },
    clips,
    ...(recipe.music?.required && audioInput ? { music: { mode: 'vibe' as const, description: `Music that suits ${recipe.category}` } } : {}),
    ...(textInputs.length ? { text: textInputs.map((input) => ({ count: 1, maxWords: input.kind === 'text' && input.maxLength ? Math.max(1, Math.floor(input.maxLength / 6)) : undefined })) } : {}),
    whyTrending: options.research ? undefined : `Offline suggestion from the bundled ${recipe.category} recipes.`,
  };
}

export function rankLocalIdeas(recipes: Recipe[], topic: string): Recipe[] {
  const terms = topic.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const score = (recipe: Recipe) => {
    const haystack = [recipe.name, recipe.description, recipe.category, ...(recipe.tags ?? [])].join(' ').toLowerCase();
    return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
  };
  return [...recipes].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 3);
}

/** Prompt used only after the user opts into research; all returned ideas must be valid brief JSON. */
/** First words of the research prompt; the chat reply capture (trendCapture.ts) finds the turn by it. */
export const TREND_PROMPT_MARKER = 'Load the reels-trends skill and research';

export function trendResearchPrompt(options: TrendIdeaOptions, recipes: Recipe[]): string {
  const catalog = recipes.map((recipe) => {
    const divisor = gcd(recipe.canvas.width, recipe.canvas.height);
    return `${recipe.id}: ${recipe.name} (${recipe.category}, ${recipe.canvas.width / divisor}:${recipe.canvas.height / divisor})`;
  }).join('\n');
  return [
    `${TREND_PROMPT_MARKER} current Instagram Reels formats/audio trends from roughly the last 14 days using web search.`,
    'Return 3–5 distinct, source-backed idea briefs as JSON, each matching the Reelsmith brief v1 shape: {version:1,target:{recipeId,ratio},clips:[{count,shotType,minLengthSec}],text:[{count,maxWords,tone}],whyTrending,sources:[{title,url,publishedAt}]}. Music is optional and uses one of {mode:"named",name}, {mode:"vibe",description}, or {mode:"instagram"}, each optionally with bpm:[min,max] and dropAtSec.',
    'Use recipeId "new" only if no listed recipe fits. Include direct source URLs and publication dates; omit claims you cannot verify. Do not download audio, log in to Instagram, or invent trends or links.',
    `User topic: ${JSON.stringify(options.topic.trim() || 'general Reels ideas')}. Approximate available clips: ${Math.max(0, Math.floor(options.availableClips))}.`,
    `Available recipes:\n${catalog}`,
    'Do not edit the timeline. Keep source citations with each brief and explain the recipe match in whyTrending.',
  ].join('\n\n');
}
