// RS-1005: local cache of Trend Scout research results. Pure and offline: no network access here.
import { validateBrief, type ReelsBrief } from './brief';

export const TREND_CACHE_KEY = 'reelsmith.trendNotes.v1';
export const TREND_STALE_DAYS = 14;
const MAX_NOTES = 10;
const DAY_MS = 86_400_000;

export interface TrendNotes { version: 1; savedAt: string; topic: string; briefs: ReelsBrief[] }
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function isStale(notes: Pick<TrendNotes, 'savedAt'>, now: Date = new Date()): boolean {
  const saved = Date.parse(notes.savedAt);
  return !Number.isFinite(saved) || now.getTime() - saved > TREND_STALE_DAYS * DAY_MS;
}

export function formatNotesDate(notes: Pick<TrendNotes, 'savedAt'>): string {
  const d = new Date(notes.savedAt);
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toISOString().slice(0, 10);
}

/** Parse pasted agent output (a JSON array of briefs, or one brief). Invalid briefs are reported, never saved. */
export function parseTrendResults(text: string): { briefs: ReelsBrief[]; errors: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { briefs: [], errors: [`invalid JSON: ${(e as Error).message}`] }; }
  const list = Array.isArray(raw) ? raw : [raw];
  const briefs: ReelsBrief[] = [], errors: string[] = [];
  list.slice(0, MAX_NOTES).forEach((item, i) => {
    const result = validateBrief(item);
    if (result.ok) briefs.push(result.brief); else errors.push(...result.errors.map((m) => `brief ${i + 1}: ${m}`));
  });
  if (list.length > MAX_NOTES) errors.push(`only the first ${MAX_NOTES} briefs are kept`);
  return { briefs, errors };
}

export function saveTrendNotes(store: KeyValueStore, topic: string, briefs: ReelsBrief[], now: Date = new Date()): TrendNotes | null {
  if (!briefs.length) return null;
  const notes: TrendNotes = { version: 1, savedAt: now.toISOString(), topic: topic.slice(0, 240), briefs: briefs.slice(0, MAX_NOTES) };
  try { store.setItem(TREND_CACHE_KEY, JSON.stringify(notes)); } catch { return null; }
  return notes;
}

/** Last saved notes, or null when missing or corrupt. Briefs are re-validated on read. */
export function loadTrendNotes(store: KeyValueStore): TrendNotes | null {
  try {
    const text = store.getItem(TREND_CACHE_KEY);
    if (!text) return null;
    const raw = JSON.parse(text) as Partial<TrendNotes>;
    if (raw.version !== 1 || typeof raw.savedAt !== 'string' || !Array.isArray(raw.briefs)) return null;
    const briefs = raw.briefs.flatMap((b) => { const r = validateBrief(b); return r.ok ? [r.brief] : []; });
    return briefs.length ? { version: 1, savedAt: raw.savedAt, topic: typeof raw.topic === 'string' ? raw.topic : '', briefs } : null;
  } catch { return null; }
}
