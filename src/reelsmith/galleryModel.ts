// RS-102: view model for the recipe gallery (cards, categories, filters). Pure, so it is cheap to render and test.
import { supportedRatios, type Recipe, type RecipeInput } from '../../shared/reelsmith/recipe';
import { RATIO_IDS, type RatioId } from '../../shared/reelsmith/ratios';

export interface RecipeCard {
  id: string;
  name: string;
  category: Recipe['category'];
  description: string;
  aspect: string;
  ratios: RatioId[];
  typicalLength: string;
  requires: string;
  poster?: string;
  loop?: string;
  tags: string[];
}

const CATEGORY_LABEL: Record<Recipe['category'], string> = {
  travel: 'Travel', vlog: 'Vlog', 'beat-cut': 'Beat cut', 'captioned-story': 'Captioned story', collage: 'Collage', other: 'Other',
};
export const categoryLabel = (c: Recipe['category']) => CATEGORY_LABEL[c];

/** Recipe files name previews as "previews/<file>"; the build (server/reelsmith/build-previews.mts) writes them to assets/recipe-previews (served at /recipe-previews). */
export function previewUrl(path: string | undefined): string | undefined {
  if (!path || /^(https?:|data:|blob:)/.test(path) || path.includes('..')) return undefined;
  const file = path.replace(/^\/?(recipe-)?previews\//, '');
  // AI-made recipes keep their generated previews in the user's recipe folder, not in the app bundle
  return /^ai-[a-z0-9-]+\.(jpg|mp4)$/.test(file) ? `/api/reelsmith/user-recipe-previews/${file}` : `/recipe-previews/${file}`;
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
export function aspectOf(width: number, height: number): string {
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

function countRange(i: RecipeInput & { kind: 'media' }): string {
  return i.min === i.max ? String(i.max) : `${i.min}–${i.max}`;
}
const noun = (i: RecipeInput & { kind: 'media' }) =>
  i.accept.length === 1 && i.accept[0] === 'audio' ? (i.max === 1 ? 'song' : 'songs')
    : i.accept.length === 1 && i.accept[0] === 'image' ? 'photos' : 'clips';

/** "6–80 clips + 1 song"; optional inputs (min 0) are shown with "optional". */
export function requirementsText(recipe: Recipe): string {
  const parts = recipe.inputs.filter((i): i is RecipeInput & { kind: 'media' } => i.kind === 'media').map((i) => {
    const n = noun(i);
    return i.min === 0 ? `optional ${n}` : `${countRange(i)} ${i.max === 1 && n === 'clips' ? 'clip' : n}`;
  });
  return parts.join(' + ');
}

export function lengthText(recipe: Recipe): string {
  const d = recipe.duration;
  if (!d) return '';
  if (d.mode === 'fitContent' && d.minSec && d.maxSec) return `${d.minSec}–${d.maxSec} s`;
  if (d.targetSec) return `~${d.targetSec} s`;
  return d.minSec && d.maxSec ? `${d.minSec}–${d.maxSec} s` : '';
}

export function toCard(r: Recipe): RecipeCard {
  return {
    id: r.id, name: r.name, category: r.category, description: r.description ?? '',
    aspect: aspectOf(r.canvas.width, r.canvas.height), ratios: supportedRatios(r), typicalLength: lengthText(r), requires: requirementsText(r),
    poster: r.preview?.poster, loop: r.preview?.loop, tags: r.tags ?? [],
  };
}

export interface GalleryState {
  cards: RecipeCard[];
  categories: Array<{ id: Recipe['category'] | 'all'; label: string; count: number }>;
  ratios: Array<{ id: RatioId | 'all'; count: number }>;
}

export function buildGallery(recipes: Recipe[], filter: { category?: Recipe['category'] | 'all'; ratio?: RatioId | 'all'; query?: string } = {}): GalleryState {
  const all = recipes.map(toCard);
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const q = filter.query?.trim().toLowerCase();
  const cards = all.filter((c) =>
    (!filter.category || filter.category === 'all' || c.category === filter.category)
    && (!filter.ratio || filter.ratio === 'all' || c.ratios.includes(filter.ratio))
    && (!q || `${c.name} ${c.description} ${c.tags.join(' ')}`.toLowerCase().includes(q)));
  return {
    cards: cards.sort((a, b) => a.name.localeCompare(b.name)),
    categories: [
      { id: 'all', label: 'All', count: all.length },
      ...[...counts.entries()].map(([id, count]) => ({ id: id as Recipe['category'], label: categoryLabel(id as Recipe['category']), count })),
    ],
    ratios: [
      { id: 'all', count: all.length },
      ...RATIO_IDS.map((id) => ({ id, count: all.filter((card) => card.ratios.includes(id)).length })),
    ],
  };
}
