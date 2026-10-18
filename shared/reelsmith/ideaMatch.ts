// Ideas panel: describe the reel you want, get recipe picks. The prompt and the answer check live here so the
// server call (server/reelsmith/ideas.ts) and the offline fallback share one recipe digest. Pure, no I/O.
import type { Recipe } from './recipe';

export interface IdeaRequest {
  description: string;
  vibes: string[];
  clips?: number;
}

export interface IdeaPick {
  recipeId: string;
  why: string;
  /** Prefilled values for the recipe's text inputs (title, place name, end line), keyed by input id. */
  texts: Record<string, string>;
}

export interface IdeaAnswer { picks: IdeaPick[]; noneFit: boolean; source: 'ai' | 'offline' }

/** Mood chips under the description box. Each expands to words found in recipe names, tags and descriptions. */
export const IDEA_VIBES: ReadonlyArray<{ id: string; label: string; words: string[] }> = [
  { id: 'retro', label: 'Retro', words: ['retro', 'vhs', 'throwback', 'vintage', 'film', '2000s', 'nostalgic', 'camcorder', 'memories'] },
  { id: 'hype', label: 'Hype', words: ['hype', 'fast', 'drop', 'beat', 'energy', 'countdown', 'spin', 'party'] },
  { id: 'dreamy', label: 'Dreamy', words: ['dreamy', 'soft', 'romantic', 'calm', 'watercolour', 'nature'] },
  { id: 'cinematic', label: 'Cinematic', words: ['cinematic', 'trailer', 'dramatic', 'moody', 'letterbox', 'widescreen'] },
  { id: 'funny', label: 'Funny', words: ['funny', 'friends', 'comic', 'chaos', 'gang', 'playful'] },
  { id: 'calm', label: 'Calm', words: ['calm', 'vlog', 'day-in-the-life', 'diary', 'slow', 'soft'] },
  { id: 'trippy', label: 'Trippy', words: ['trippy', 'psychedelic', 'kaleidoscope', 'mirror', 'glitch', 'thermal', 'fisheye'] },
  { id: 'artsy', label: 'Artsy', words: ['artsy', 'poster', 'duotone', 'zine', 'paper', 'collage', 'scrapbook', 'halftone'] },
  { id: 'travel', label: 'Travel', words: ['travel', 'trip', 'place', 'city', 'stats', 'miniature'] },
  { id: 'story', label: 'Talking', words: ['story', 'talking', 'captions', 'captioned', 'speech'] },
];

const SYNONYMS: Record<string, string[]> = {
  trip: ['travel'], vacation: ['travel'], holiday: ['travel'], beach: ['travel', 'scenery'], mountains: ['travel', 'scenery'],
  friends: ['gang', 'friends'], squad: ['gang', 'friends'], party: ['night', 'party'], club: ['night', 'party'],
  old: ['retro', 'vintage'], nostalgia: ['nostalgic', 'memories'], family: ['family', 'memories'],
  photos: ['photos', 'dump'], pictures: ['photos', 'dump'], talk: ['captions', 'story'], vlog: ['vlog', 'day'],
  dance: ['dance'], skate: ['skate'], kids: ['kids', 'playful'], city: ['city', 'architecture'],
};

const effectName = (assetId: string) => assetId.replace(/^builtin:(fx|look)-/, '');

/** One line per recipe: what the model and the offline matcher know about it. */
export function recipeDigest(recipe: Recipe): string {
  const effects = [...(recipe.look?.effects ?? []), ...recipe.structure.flatMap((s) => s.effects ?? [])].map((e) => effectName(e.assetId));
  const transitions = recipe.structure.map((s) => s.transition).filter((t): t is string => !!t && t !== 'cut' && t !== 'auto');
  const clipInput = recipe.inputs.find((input) => input.kind === 'media' && !input.accept.includes('audio'));
  const texts = recipe.inputs.filter((input) => input.kind === 'text')
    .map((input) => `${input.id} "${input.label}"${input.maxLength ? ` ≤${input.maxLength} chars` : ''}${input.optional ? ' optional' : ''}`);
  return [
    `${recipe.id}: ${recipe.name} [${recipe.category}]`,
    recipe.description ?? '',
    recipe.tags?.length ? `tags: ${recipe.tags.join(', ')}` : '',
    effects.length ? `effects: ${[...new Set(effects)].join(', ')}` : '',
    transitions.length ? `transitions: ${[...new Set(transitions)].join(', ')}` : '',
    clipInput?.kind === 'media' ? `clips: ${clipInput.min}–${clipInput.max} (${clipInput.label}${clipInput.hint ? `: ${clipInput.hint}` : ''})` : '',
    recipe.music?.required ? 'needs a song' : '',
    texts.length ? `text inputs: ${texts.join('; ')}` : '',
  ].filter(Boolean).join(' | ');
}

/** JSON schema handed to `claude --json-schema`, so the reply is structured output rather than prose. */
export const IDEA_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks', 'noneFit'],
  properties: {
    noneFit: { type: 'boolean' },
    picks: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object', additionalProperties: false, required: ['recipeId', 'why', 'texts'],
        properties: {
          recipeId: { type: 'string' },
          why: { type: 'string' },
          texts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['inputId', 'text'], properties: { inputId: { type: 'string' }, text: { type: 'string' } } } },
        },
      },
    },
  },
} as const;

export function ideaPrompt(request: IdeaRequest, recipes: readonly Recipe[]): string {
  const vibes = request.vibes.map((id) => IDEA_VIBES.find((vibe) => vibe.id === id)?.label).filter(Boolean);
  return [
    'You pick Instagram Reels recipes for the user of a reel editor. Each recipe is a finished style: a grade, effects, transitions and text, assembled automatically from their clips.',
    `What the user wants: ${JSON.stringify(request.description.trim() || '(no description)')}`,
    vibes.length ? `Moods they ticked: ${vibes.join(', ')}` : '',
    request.clips ? `They have about ${request.clips} clips.` : '',
    `Recipes:\n${recipes.map(recipeDigest).join('\n')}`,
    [
      'Return 3 to 5 picks, best first, only from the recipe ids above. Prefer variety: not five recipes with the same look.',
      'why: one short sentence (under 20 words) saying what this recipe will do with *their* footage, e.g. "Your wide beach shots turn into a toy town." Do not repeat the recipe description.',
      'texts: fill the recipe\'s text inputs from what they said (place names, the trip line, a title), within each input\'s length. Use only facts from their description; leave out inputs you cannot fill. Never invent names, places or dates.',
      'If a recipe needs fewer clips than they have, or more, it can still fit; mention it only if it matters.',
      'noneFit: true only when none of the recipes match what they asked for (still return the closest picks).',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** Over-long text is cut at the last whole word that fits, never mid-word. */
function fitText(value: unknown, max: number): string {
  const text = clean(value, 10_000);
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return cut.slice(0, Math.max(0, cut.lastIndexOf(' '))).trim();
}

/** Check the model's answer against the real catalog: unknown ids, duplicates and stray text inputs are dropped. */
export function parseIdeaAnswer(value: unknown, recipes: readonly Recipe[]): IdeaAnswer | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { picks?: unknown }).picks)) return null;
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const picks: IdeaPick[] = [];
  for (const raw of (value as { picks: unknown[] }).picks) {
    if (!raw || typeof raw !== 'object') continue;
    const pick = raw as { recipeId?: unknown; why?: unknown; texts?: unknown };
    const recipe = typeof pick.recipeId === 'string' ? byId.get(pick.recipeId) : undefined;
    if (!recipe || picks.some((p) => p.recipeId === recipe.id)) continue;
    const texts: Record<string, string> = {};
    for (const entry of Array.isArray(pick.texts) ? pick.texts : []) {
      const input = recipe.inputs.find((i) => i.kind === 'text' && i.id === (entry as { inputId?: unknown })?.inputId);
      const text = input?.kind === 'text' ? fitText((entry as { text?: unknown }).text, input.maxLength ?? 120) : '';
      if (input && text) texts[input.id] = text;
    }
    picks.push({ recipeId: recipe.id, why: clean(pick.why, 200), texts });
    if (picks.length === 5) break;
  }
  if (!picks.length) return null;
  return { picks, noneFit: (value as { noneFit?: unknown }).noneFit === true, source: 'ai' };
}

function queryWords(request: IdeaRequest): string[] {
  const typed = request.description.toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 2);
  const expanded = typed.flatMap((word) => [word, ...(SYNONYMS[word] ?? [])]);
  const vibeWords = request.vibes.flatMap((id) => IDEA_VIBES.find((vibe) => vibe.id === id)?.words ?? []);
  return [...new Set([...expanded, ...vibeWords])];
}

/** Offline fallback: weighted word match over name, tags, category and description, with the matched words as the reason. */
export function rankIdeasOffline(request: IdeaRequest, recipes: readonly Recipe[], limit = 4): IdeaAnswer {
  const words = queryWords(request);
  const scored = recipes.map((recipe) => {
    const tags = (recipe.tags ?? []).join(' ').toLowerCase();
    const name = `${recipe.name} ${recipe.category}`.toLowerCase();
    const body = recipeDigest(recipe).toLowerCase();
    const hits = words.filter((word) => body.includes(word));
    const score = hits.reduce((total, word) => total + (tags.includes(word) ? 3 : 0) + (name.includes(word) ? 2 : 0) + 1, 0);
    return { recipe, score, hits };
  });
  scored.sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));
  const picks = scored.slice(0, limit).map(({ recipe, hits }) => ({
    recipeId: recipe.id,
    why: hits.length ? `Matches ${hits.slice(0, 4).join(', ')}.` : 'A popular starting point.',
    texts: {},
  }));
  return { picks, noneFit: words.length > 0 && scored[0]!.score === 0, source: 'offline' };
}
