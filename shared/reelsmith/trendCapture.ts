// RS-1005: keep the agent's reply to the Trend Scout research prompt without pasting it. Pure: the caller passes the
// chat messages and a key-value store, so it is tested without a browser.
import { TREND_PROMPT_MARKER } from './trendScout';
import { parseTrendResults, saveTrendNotes, sourceWarnings, type KeyValueStore, type TrendNotes } from './trendCache';

export const TREND_CAPTURED_KEY = 'reelsmith.trendCaptured.v1';

export interface ChatLine { role: string; text: string }
export interface TrendCaptureResult { notes: TrendNotes | null; errors: string[]; warnings: string[] }

function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.length}:${h}`;
}

function topicOf(prompt: string): string {
  const m = /User topic: ("(?:[^"\\]|\\.)*")/.exec(prompt);
  if (!m) return '';
  try { const t = JSON.parse(m[1]!); return typeof t === 'string' ? t : ''; } catch { return ''; }
}

/**
 * Call after each chat update. When a finished turn answers the research prompt, parse the reply into briefs and save
 * them. Each distinct reply is looked at once (a reply that cannot be read is reported once, and can still be pasted).
 */
export function captureTrendReply(store: KeyValueStore, messages: readonly ChatLine[], running: boolean, now: Date = new Date()): TrendCaptureResult | null {
  if (running) return null;
  let promptAt = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === 'user' && messages[i]!.text.includes(TREND_PROMPT_MARKER)) { promptAt = i; break; }
  }
  if (promptAt < 0) return null;
  let reply: ChatLine | undefined;
  for (let i = messages.length - 1; i > promptAt; i -= 1) {
    if (messages[i]!.role === 'assistant' && messages[i]!.text.trim()) { reply = messages[i]; break; }
  }
  if (!reply) return null;
  const seen = fingerprint(reply.text);
  try { if (store.getItem(TREND_CAPTURED_KEY) === seen) return null; store.setItem(TREND_CAPTURED_KEY, seen); } catch { /* storage blocked: still try once */ }
  const { briefs, errors } = parseTrendResults(reply.text);
  if (!briefs.length) return { notes: null, errors: errors.length ? errors : ['no briefs found in the reply'], warnings: [] };
  const notes = saveTrendNotes(store, topicOf(messages[promptAt]!.text), briefs, now);
  return { notes, errors, warnings: sourceWarnings(briefs, now) };
}
