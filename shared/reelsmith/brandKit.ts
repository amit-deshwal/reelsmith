// RS-1239: a brand kit read from one web page the user names (their club, shop or page), for promo reels. The director
// may only put the user's own words on screen; for a promo reel the site's words are theirs: its name, tagline,
// headings, the numbers it states and its call to action. Its colours and fonts feed the look of the lines and the end
// card. Pure parsing (no network) so it is checked on fixtures; server/reelsmith/brandFetch.ts fetches the page.

export interface BrandKit {
  url: string;
  name: string;
  tagline?: string;
  /** the page's headings and short statements, in page order */
  lines: string[];
  /** sentences with a number in them ("2,300+ trekkers", "100% volunteer-run") */
  facts: string[];
  /** what the page asks people to do ("Join free on WhatsApp") */
  actions: string[];
  /** where that action goes: whatsapp, instagram (@handle), telegram, youtube, email, phone, the site itself */
  links: Array<{ kind: string; label: string }>;
  /** the brand colours, most used first (hex) */
  colors: string[];
  fonts: string[];
  /** the share image or icon (a URL; not downloaded) */
  image?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', middot: '·' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function meta(html: string, key: string): string | undefined {
  // <meta property="og:title" content="..."> in either attribute order
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i').exec(html);
  const v = (a ?? b)?.[1];
  return v ? clean(v) : undefined;
}

const uniq = (xs: string[]) => { const seen = new Set<string>(); return xs.filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

const ACTION = /\b(join|book|sign ?up|register|whats ?app|shop|buy|order|follow|subscribe|download|contact|enquire|enroll|apply|reserve|get started|call us|dm us|message us|visit)\b/i;

/** Hex colours that read as a colour (not black, white or grey). */
function vivid(hex: string): boolean {
  const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!);
  return max > 30 && (max - min) / max > 0.25 && max - min > 12;
}

const normHex = (hex: string) => (hex.length === 4 ? `#${hex.slice(1).split('').map((c) => c + c).join('')}` : hex.slice(0, 7)).toLowerCase();

function linksOf(html: string, base: string): BrandKit['links'] {
  const out: BrandKit['links'] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1]!);
    if (/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/i.test(href)) out.push({ kind: 'whatsapp', label: 'WhatsApp' });
    else if (/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?:[?#]|$)/i.test(href)) {
      const handle = /instagram\.com\/([A-Za-z0-9_.]{2,30})/i.exec(href)![1]!;
      if (!/^(p|reel|reels|explore|stories|accounts)$/i.test(handle)) out.push({ kind: 'instagram', label: `@${handle}` });
    } else if (/(?:t\.me|telegram\.me)\//i.test(href)) out.push({ kind: 'telegram', label: 'Telegram' });
    else if (/youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/)/i.test(href)) out.push({ kind: 'youtube', label: 'YouTube' });
    else if (/^mailto:([^?]+)/i.test(href)) out.push({ kind: 'email', label: /^mailto:([^?]+)/i.exec(href)![1]! });
    else if (/^tel:/i.test(href)) out.push({ kind: 'phone', label: href.slice(4).trim() });
  }
  let host = '';
  try { host = new URL(base).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
  if (host) out.push({ kind: 'site', label: host });
  const seen = new Set<string>();
  return out.filter((l) => { const k = `${l.kind}:${l.label.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

/** The page's text one block at a time (a paragraph, a list item, a card), so a number stays with its own words. */
function blocksOf(visible: string): string[] {
  return visible.split(/<\/?(?:p|li|div|section|article|header|footer|h[1-6]|br|tr|td|dd|dt|button|a|summary|figcaption|blockquote)\b[^>]*>/i).map(clean).filter(Boolean);
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const TRAIL = /\s+(across|of|in|and|the|to|with|for|on|at|by|from|a|an|or)$/i;
const UI_COUNT = /^\d+\s+(photos?|videos?|comments?|likes?|views?|visits?|items?|results?|reviews?|min(ute)?s?( read)?|sec(ond)?s?)$/i;

/** Statements with a number in them ("~2,300 members across 3 groups", "100% volunteer-run"); never dates, times or UI counts. */
function factClauses(block: string): string[] {
  if (!/\d/.test(block)) return [];
  // a long sentence gives the clause that holds the number
  const parts = block.length <= 70 ? [block] : block.split(/(?<=[.!?;:])\s+|,\s+|\s+[–—]\s+/).filter((p) => /\d/.test(p));
  return parts.map((p) => {
    let s = p.trim().replace(/[.!?;:,]+$/, '');
    // a clause longer than a line: the number and the words around it
    if (s.length > 70) s = /(?:\S+\s+){0,3}[~≈]?\d[\d,.]*\s?(?:\+|%|k\b|K\b)?(?:\s+\S+){1,5}/.exec(s)?.[0] ?? '';
    while (TRAIL.test(s)) s = s.replace(TRAIL, '');
    return s.replace(/^(yes|no|so|and|but)\b[,.]?\s+/i, '').trim();
  }).filter((s) => s.length >= 5 && s.length <= 70 && /[A-Za-z]{3}/.test(s)
    && !/\b(19|20)\d\d\b/.test(s) && !MONTH.test(s) && !/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b/i.test(s)
    && !s.split(/\s*[·|•]\s*/).every((x) => UI_COUNT.test(x)) && !/cookie|copyright|rights reserved|\bpx\b|°|\b(temperature|weather)\b/i.test(s));
}

export function parseBrandHtml(html: string, url: string): BrandKit {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? '');
  const site = meta(body, 'og:site_name') ?? meta(body, 'application-name');
  const name = site ?? (title.split(/\s+[|–—\-:·]\s+/)[0] ?? title) ?? '';
  const tagline = meta(body, 'og:description') ?? meta(body, 'description') ?? meta(body, 'twitter:description');
  const visible = body.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<head[\s\S]*?<\/head>/i, ' ');
  const headings = [...visible.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((m) => clean(m[1]!)).filter((s) => s.length >= 3 && s.length <= 90);
  // short statements set apart in the page (hero lines, list items, strong text)
  const shorts = [...visible.matchAll(/<(?:p|li|strong|b|span)[^>]*>([^<]{6,80})<\/(?:p|li|strong|b|span)>/gi)].map((m) => clean(m[1]!)).filter((s) => /[A-Za-z]/.test(s) && s.split(' ').length <= 12);
  const actions = uniq([...visible.matchAll(/<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)].map((m) => clean(m[1]!)).filter((s) => s.length >= 3 && s.length <= 40 && ACTION.test(s))).slice(0, 6);
  const facts = uniq(blocksOf(visible).flatMap(factClauses)).slice(0, 8);
  const css = [...body.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join('\n') + [...body.matchAll(/style=["']([^"']*)["']/gi)].map((m) => m[1]!).join(';');
  const counts = new Map<string, number>();
  const theme = meta(html, 'theme-color');
  if (theme && /^#[0-9a-f]{3,8}$/i.test(theme) && vivid(theme)) counts.set(normHex(theme), 1000);
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = `#${m[1]!}`;
    if (vivid(hex)) counts.set(normHex(hex), (counts.get(normHex(hex)) ?? 0) + 1);
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
  const fontFamilies = [...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map((m) => m[1]!.split(',')[0]!.replace(/["']/g, '').trim())
    .concat([...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi)].map((m) => decodeURIComponent(m[1]!).split(':')[0]!.replace(/\+/g, ' ')))
    .filter((f) => f && !/^(inherit|initial|var\(|-apple-system|system-ui|sans-serif|serif|monospace|arial|helvetica)/i.test(f));
  const fonts = uniq(fontFamilies).slice(0, 3);
  const img = meta(html, 'og:image') ?? /<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  let image: string | undefined;
  if (img) { try { image = new URL(img, url).toString(); } catch { image = undefined; } }
  const lines = uniq([...headings, ...shorts]).filter((s) => s !== name && s !== tagline).slice(0, 12);
  return { url, name: name.slice(0, 60), ...(tagline ? { tagline: tagline.slice(0, 200) } : {}), lines, facts, actions, links: linksOf(body, url), colors, fonts, ...(image ? { image } : {}) };
}

/** Relative luminance of a hex colour, 0 (black) .. 1 (white). */
export function luminance(hex: string): number {
  const h = normHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Which brand colour goes where on the end card: a light one for the button over footage, a dark one for a solid background. */
export function brandPalette(colors: readonly string[]): { accent: string; background?: string } {
  const light = colors.filter((c) => luminance(c) > 0.25).sort((a, b) => luminance(b) - luminance(a));
  const dark = colors.filter((c) => luminance(c) < 0.12).sort((a, b) => luminance(a) - luminance(b));
  // a page with only dark colours: its colour becomes the background and the button stays a light, readable one
  return { accent: light[0] ?? (dark.length ? '#ffffff' : colors[0] ?? '#ffb020'), ...(dark[0] ? { background: dark[0] } : {}) };
}

/** The one thing the end card should ask: the page's own action, else where its links go. */
export function brandAction(kit: BrandKit): string | undefined {
  const wa = kit.actions.find((a) => /whats ?app/i.test(a)) ?? kit.actions[0];
  if (wa) return wa;
  const link = kit.links.find((l) => l.kind === 'whatsapp') ?? kit.links.find((l) => l.kind === 'instagram');
  return link ? (link.kind === 'whatsapp' ? 'Join on WhatsApp' : `Follow ${link.label}`) : undefined;
}

/** Everything the brand kit lets the reel say, as one text (the treatment's word check reads it like the story). */
export function brandWords(kit: BrandKit): string {
  return [kit.name, kit.tagline ?? '', brandAction(kit) ?? '', 'link in bio', ...kit.lines, ...kit.facts, ...kit.actions, ...kit.links.map((l) => l.label)].join(' \n ');
}

/** The kit for the agent: short lines, no empty fields (results over 16k characters reach an external agent badly). */
export function brandKitText(kit: BrandKit): Record<string, unknown> {
  return {
    name: kit.name,
    ...(kit.tagline ? { tagline: kit.tagline } : {}),
    ...(kit.lines.length ? { lines: kit.lines } : {}),
    ...(kit.facts.length ? { facts: kit.facts } : {}),
    ...(kit.actions.length ? { actions: kit.actions } : {}),
    links: kit.links.map((l) => `${l.kind}: ${l.label}`),
    ...(kit.colors.length ? { colors: kit.colors, endCard: brandPalette(kit.colors) } : {}),
    ...(kit.fonts.length ? { fonts: kit.fonts } : {}),
    use: 'Write the promo\'s lines yourself in punch-caps, one on every part, from what this page says: its problem and promise, its facts (numbers only from facts and lines, never invented), who it welcomes, its price. End on a cta-card held 8-12 beats: kicker, the name, tagline (from the page), ONE action from actions/links, "link in bio · <site>", ask "save-tag"; a handle-tag from after the hook. Colours: the endCard accent for the button, the key-word boxes and the handle dot; background (solid true) behind the card. Never a dark button over dark footage.',
  };
}
