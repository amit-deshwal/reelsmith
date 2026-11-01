// RS-1239: fetch the one page the user named for a promo reel and read its brand kit (shared/reelsmith/brandKit.ts).
// The agents never get web access (WebFetch is denied); this is a single GET of a URL the user typed, made only when the
// director is asked for a brand kit. Size- and time-capped; nothing else on the page (scripts, stylesheets, images) is
// loaded.
import { parseBrandHtml, type BrandKit } from '../../shared/reelsmith/brandKit.ts';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** "punetrekkers.org" → "https://punetrekkers.org/"; only http(s) pages. */
export function brandUrl(raw: unknown): string | { error: string } {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { error: 'url is required' };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { return { error: `not a web address: ${s}` }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'only http(s) pages' };
  if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0|\[?::1\]?$)/i.test(u.hostname) || /\.local$/i.test(u.hostname)) return { error: 'only public web pages' };
  return u.toString();
}

export async function fetchBrandKit(raw: unknown, fetcher: typeof fetch = fetch): Promise<BrandKit> {
  const url = brandUrl(raw);
  if (typeof url !== 'string') throw new Error(url.error);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`the page answered ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) throw new Error(`not a web page (${type})`);
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        html += dec.decode(value, { stream: true });
        if (size > MAX_BYTES) { await reader.cancel(); break; }
      }
    } else html = (await res.text()).slice(0, MAX_BYTES);
    return parseBrandHtml(html, res.url || url);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`the page took longer than ${TIMEOUT_MS / 1000} s`);
    throw e;
  } finally { clearTimeout(timer); }
}
