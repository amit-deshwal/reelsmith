// RS-003 / RS-404: fonts bundled with Reelsmith (files built by server/reelsmith/sync-fonts.mts into
// assets/fonts/rs/). Each is registered as a local font, so the editor and the export renderer load it from
// /fonts/rs/... instead of Google Fonts. Large CJK display families stay on their upstream loaders.
import type { LocalCjkFont } from '../fonts/localFonts';

export interface ReelsmithFont { family: string; slug: string; weights: number[] }

const W = (...w: number[]) => w;
export const REELSMITH_FONTS: readonly ReelsmithFont[] = [
  { family: 'Anton', slug: 'anton', weights: W(400) },
  { family: 'Archivo Black', slug: 'archivo-black', weights: W(400) },
  { family: 'Bangers', slug: 'bangers', weights: W(400) },
  { family: 'Bebas Neue', slug: 'bebas-neue', weights: W(400) },
  { family: 'Barlow Condensed', slug: 'barlow-condensed', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Bowlby One', slug: 'bowlby-one', weights: W(400) },
  { family: 'Caveat', slug: 'caveat', weights: W(400, 500, 600, 700) },
  { family: 'Cormorant Garamond', slug: 'cormorant-garamond', weights: W(400, 500, 600, 700) },
  { family: 'DM Sans', slug: 'dm-sans', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Figtree', slug: 'figtree', weights: W(300, 400, 500, 600, 700) },
  { family: 'Dancing Script', slug: 'dancing-script', weights: W(400, 500, 600, 700) },
  { family: 'Fraunces', slug: 'fraunces', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Fredoka', slug: 'fredoka', weights: W(400, 500, 600, 700) },
  { family: 'Inter', slug: 'inter', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Inter Tight', slug: 'inter-tight', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Libre Baskerville', slug: 'libre-baskerville', weights: W(400, 700) },
  { family: 'Montserrat', slug: 'montserrat', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Mulish', slug: 'mulish', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Newsreader', slug: 'newsreader', weights: W(400, 500, 600, 700, 800) },
  { family: 'Nunito', slug: 'nunito', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Oswald', slug: 'oswald', weights: W(400, 500, 600, 700) },
  { family: 'Pinyon Script', slug: 'pinyon-script', weights: W(400) },
  { family: 'Playfair Display', slug: 'playfair-display', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Roboto', slug: 'roboto', weights: W(400, 500, 700, 900) },
  { family: 'Sora', slug: 'sora', weights: W(400, 500, 600, 700, 800) },
  { family: 'Space Mono', slug: 'space-mono', weights: W(400, 700) },
  { family: 'Special Elite', slug: 'special-elite', weights: W(400) },
  { family: 'Unbounded', slug: 'unbounded', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'VT323', slug: 'vt323', weights: W(400) },
  // RS-404: Hindi / Marathi captions and titles
  { family: 'Noto Sans Devanagari', slug: 'noto-sans-devanagari', weights: W(400, 500, 600, 700, 800, 900) },
  { family: 'Poppins', slug: 'poppins', weights: W(400, 500, 600, 700, 800, 900) },
];

/** Entries in the shape the upstream local-font loader understands (stylesheet + weight range). */
export const REELSMITH_LOCAL_FONTS: LocalCjkFont[] = REELSMITH_FONTS.map((f) => ({
  family: f.family,
  importName: f.family.replace(/\s+/g, ''),
  aliasZh: [],
  stylesheet: `/fonts/rs/${f.slug}/${f.slug}.css`,
  weightRange: [Math.min(...f.weights), Math.max(...f.weights)] as const,
}));
