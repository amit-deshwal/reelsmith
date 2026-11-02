// Hindi and Marathi text in Reels (RS-1253). The display faces the director and the caption styles use (Anton,
// Montserrat, Inter Tight...) have no Devanagari letters, so a Hindi line fell back to whatever font the browser found,
// thin and different in preview and export. A built reel's text now carries Noto Sans Devanagari (bundled, RS-404) after
// its own face: Latin letters keep the style's face, Devanagari ones get the bundled one, and the font loader (which
// splits a family stack) loads both for the export.
import type { AtomicAction } from '../editor/reducerActions';

export const DEVANAGARI_FONT = 'Noto Sans Devanagari';

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

export const hasDevanagari = (text: string | undefined | null): boolean => !!text && DEVANAGARI.test(text);

/** The family stack for this text: the face itself, then the bundled Devanagari face when the text needs it. */
export function withScriptFont(family: string | undefined, text: string): string | undefined {
  if (!hasDevanagari(text)) return family;
  if (!family?.trim()) return DEVANAGARI_FONT;
  if (family.toLowerCase().includes('devanagari')) return family;
  return `${family}, ${DEVANAGARI_FONT}`;
}

/**
 * The weight for this text. A light display face (Anton is one weight, 400) would ask Noto for its thin cut, so text with
 * no Latin letters (which never reaches the display face) gets a heavy Devanagari weight instead.
 */
export function scriptWeight(weight: number | undefined, text: string): number | undefined {
  if (!hasDevanagari(text) || LATIN.test(text)) return weight;
  return Math.max(800, weight ?? 0);
}

const TEXT_KEYS = /^(text|sub|label|title|subtitle|line|lines|caption|words?|content)$/i;

/** Every on-screen string in an item's props (the keys that hold words, a few levels deep). */
function propText(obj: unknown, depth = 0, key = ''): string {
  if (depth > 4 || obj == null) return '';
  if (typeof obj === 'string') return TEXT_KEYS.test(key) ? obj : '';
  if (Array.isArray(obj)) return obj.map((v) => propText(v, depth + 1, key)).join(' ');
  if (typeof obj !== 'object') return '';
  return Object.entries(obj as Record<string, unknown>).map(([k, v]) => propText(v, depth + 1, k)).join(' ');
}

function patchFonts(obj: unknown, text: string, depth = 0): unknown {
  if (depth > 4 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => patchFonts(v, text, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/fontfamily$/i.test(k) && typeof v === 'string') out[k] = withScriptFont(v, text);
    else if (/^fontWeight$/.test(k) && (typeof v === 'number' || v === undefined)) out[k] = scriptWeight(v as number | undefined, text);
    else out[k] = patchFonts(v, text, depth + 1);
  }
  return out;
}

/**
 * A built batch with Devanagari-ready fonts: text and motion-graphic items whose words are Devanagari get the stack and
 * weight above, and the captions do when their words or any transcript in the batch (a voiceover) are Devanagari.
 */
export function withScriptFonts(actions: AtomicAction[]): AtomicAction[] {
  const said = (words: unknown) => (Array.isArray(words) ? (words as Array<{ text?: unknown }>).map((w) => String(w.text ?? '')) : []);
  const spoken = actions.flatMap((a) => (a.type === 'add' ? said((a.item as { transcript?: unknown }).transcript)
    : a.type === 'setCaptions' ? said((a.captions as { words?: unknown } | null)?.words) : [])).join(' ');
  return actions.map((a) => {
    if (a.type === 'add' && (a.item.kind === 'text' || a.item.kind === 'motion-graphic')) {
      const own = (a.item as unknown as { text?: unknown }).text;
      const text = propText(a.item.props) + ' ' + (typeof own === 'string' ? own : '');
      if (!hasDevanagari(text)) return a;
      return { ...a, item: { ...a.item, props: patchFonts(a.item.props, text) as typeof a.item.props } };
    }
    if (a.type === 'setCaptions' && hasDevanagari(spoken)) {
      const c = a.captions as { styleOverride?: { fontFamily?: string; fontWeight?: number } } | null;
      if (!c) return a;
      const style = c.styleOverride ?? {};
      const weight = style.fontWeight === undefined ? {} : { fontWeight: scriptWeight(style.fontWeight, spoken) };
      return { ...a, captions: { ...c, styleOverride: { ...style, fontFamily: withScriptFont(style.fontFamily, spoken), ...weight } } } as AtomicAction;
    }
    return a;
  });
}
