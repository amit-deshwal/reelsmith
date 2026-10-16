import type { TimelineItem } from '../editor/types.js';
import { isStableIdentity } from '../transcript/identity.js';
import { isManualCaptionEntry } from './manualCaptions.js';
import { effectivePreset } from './renderStyles.js';
import {
  applyWordOverrides,
  resolveCaptionProjection,
  type CaptionProjection,
} from './resolve.js';
import { orderedCaptionSourceEntries } from './sourceOrder.js';
import {
  CAPTION_MAX_CHARS_PER_LINE,
  CAPTION_MAX_VISUAL_LINES,
  LINGER_MS,
  paginate,
  type CaptionPage,
  type CaptionsData,
  type CaptionSourceEntry,
} from './types.js';

function withCueEdits<T extends { words: import('../transcript/types.js').TranscriptWord[]; indices: number[]; wordRefs: string[] }>(value: T, edits: CaptionsData['cueEdits']): T {
  if (!edits) return value;
  const positions = new Map(value.wordRefs.map((ref, index) => [ref, index]));
  const replacements = new Map<number, { words: import('../transcript/types.js').TranscriptWord[]; indices: number[]; refs: string[]; sourceRefs: string[] }>();
  for (const [key, edit] of Object.entries(edits)) {
    const sourcePositions = edit.sourceRefs.map((ref) => positions.get(ref));
    if (sourcePositions.some((position) => position === undefined)) continue;
    const first = sourcePositions[0]!;
    if (!sourcePositions.every((position, offset) => position === first + offset)) continue;
    const anchor = (ref?: string) => ref ? value.words[positions.get(ref) ?? -1] : undefined;
    const output = edit.words.map((part, partIndex) => {
      const source = part.sourceRef ? anchor(part.sourceRef) : undefined;
      if (source) return { word: { ...source, text: part.text }, ref: part.sourceRef!, index: value.indices[positions.get(part.sourceRef)!]! };
      const before = anchor(part.beforeRef);
      const after = anchor(part.afterRef);
      const count = Math.max(1, part.insertionCount ?? 1);
      const fraction = ((part.insertionIndex ?? 0) + 1) / (count + 1);
      const start = before && after ? before.end + (after.start - before.end) * (fraction - 0.0) : before ? before.end : after ? after.start : value.words[first]!.start;
      const end = before && after ? before.end + (after.start - before.end) * Math.min(1, fraction + 0.18) : before ? before.end + Math.max(1, (value.words[sourcePositions[sourcePositions.length - 1]!]!.end - before.end) / (count + 1)) : after ? Math.max(0, after.start - Math.max(1, (after.start - value.words[first]!.start) / (count + 1))) : value.words[first]!.end;
      return { word: { ...value.words[first]!, id: `${key}:insert:${partIndex}`, text: part.text, start, end: Math.max(start, end) }, ref: `${key}:insert:${partIndex}`, index: value.indices[first]! };
    });
    replacements.set(first, { words: output.map((entry) => entry.word), refs: output.map((entry) => entry.ref), indices: output.map((entry) => entry.index), sourceRefs: edit.sourceRefs });
  }
  if (!replacements.size) return value;
  const words: typeof value.words = []; const indices: number[] = []; const wordRefs: string[] = [];
  for (let index = 0; index < value.words.length;) {
    const replacement = replacements.get(index);
    if (!replacement) { words.push(value.words[index]!); indices.push(value.indices[index]!); wordRefs.push(value.wordRefs[index]!); index++; continue; }
    words.push(...replacement.words); indices.push(...replacement.indices); wordRefs.push(...replacement.refs); index += replacement.sourceRefs.length;
  }
  return { ...value, words, indices, wordRefs };
}

export interface CaptionPageIdentity {
  id: string;
  laneId: string;
  laneOrder: number;
  entry?: CaptionSourceEntry;
  page: CaptionPage;
  srcIdxs: number[];
  wordRefs: string[];
  manual: boolean;
}

const pageId = (laneId: string, refs: readonly string[], page: CaptionPage): string => {
  const stable = refs.length === page.words.length && refs.every(isStableIdentity);
  return stable
    ? `page2:${laneId}:${refs.join('|')}`
    : `legacy:${laneId}:${page.start}:${page.end}:${page.words.map((word) => word.text).join('\u0000')}`;
};

function lanePages(
  captions: CaptionsData,
  entry: CaptionSourceEntry,
  laneOrder: number,
  projection: CaptionProjection,
  globalIndexByRef: ReadonlyMap<string, number>,
): CaptionPageIdentity[] {
  const { words, wordRefs: refs } = projection;
  // Stable source identity is authoritative. Numeric legacy positions are only
  const sourceIndices = refs.map((ref) => globalIndexByRef.get(ref) ?? -1);
  const indices = isStableIdentity(entry.id) ? sourceIndices.map(() => -1) : sourceIndices;
  const applied = withCueEdits(applyWordOverrides(words, indices, captions.wordOverrides, refs), captions.cueEdits);
  const requestedLines = captions.perSource?.[entry.id]?.maxLines;
  const validLines = typeof requestedLines === 'number' && Number.isFinite(requestedLines)
    ? Math.floor(requestedLines)
    : CAPTION_MAX_VISUAL_LINES;
  const lines = Math.max(1, Math.min(CAPTION_MAX_VISUAL_LINES, validLines));
  const preset = entry.style ? { ...effectivePreset(captions), ...entry.style } : effectivePreset(captions);
  const perPage = requestedLines === undefined ? preset.wordsPerPage : Math.max(1, (preset.wordsPerPage ?? 6) * lines);
  const manual = isManualCaptionEntry(entry);
  const pages = manual
    ? applied.words.map((word) => ({ words: [word], start: word.start, end: word.end }))
    : paginate(applied.words, captions.pacing, perPage, applied.breakBefore, CAPTION_MAX_CHARS_PER_LINE, lines);
  let cursor = 0;
  return pages.map((page) => {
    const wordRefs = applied.wordRefs.slice(cursor, cursor + page.words.length);
    const srcIdxs = wordRefs.map((ref) => globalIndexByRef.get(ref) ?? -1).filter((index) => index >= 0);
    cursor += page.words.length;
    return { id: pageId(entry.id, wordRefs, page), laneId: entry.id, laneOrder, entry, page, srcIdxs, wordRefs, manual };
  });
}

/** Identity-keyed memo for the pure (captions, items, fps) → pages pipeline.
 * Reducers are immutable, so the same items/captions references recur within a
 * state's lifetime — the timeline caption lane re-runs the whole merge +
 * pagination on every render and at every drag start (captionSnapPoints),
 * which is expensive for large merged sources. WeakMap keeps the cache bounded
 * by live state references; every caller treats the output as read-only. */
const captionPagesMemo = new WeakMap<TimelineItem[], WeakMap<CaptionsData, Map<number, CaptionPageIdentity[]>>>();

/** Canonical lane-aware pagination shared by preview, selection, and subtitle export. */
export function buildCaptionPages(captions: CaptionsData, items: TimelineItem[], fps: number): CaptionPageIdentity[] {
  let byCaptions = captionPagesMemo.get(items);
  if (!byCaptions) {
    byCaptions = new WeakMap();
    captionPagesMemo.set(items, byCaptions);
  }
  let byFps = byCaptions.get(captions);
  if (!byFps) {
    byFps = new Map();
    byCaptions.set(captions, byFps);
  }
  const cached = byFps.get(fps);
  if (cached) return cached;
  const pages = computeCaptionPages(captions, items, fps);
  byFps.set(fps, pages);
  return pages;
}

function computeCaptionPages(captions: CaptionsData, items: TimelineItem[], fps: number): CaptionPageIdentity[] {
  const projection = resolveCaptionProjection(captions, items, fps);
  if (captions.sourceEntries?.length) {
    const entries = orderedCaptionSourceEntries(captions.sourceEntries).filter((entry) => entry.visible !== false);
    const globalIndexByRef = new Map(projection.wordRefs.map((ref, index) => [ref, index]));
    return entries.flatMap((entry, laneOrder) => lanePages(captions, entry, laneOrder, projection.entries!.get(entry)!, globalIndexByRef))
      .sort((left, right) => left.page.start - right.page.start || left.laneOrder - right.laneOrder || left.page.end - right.page.end || left.id.localeCompare(right.id));
  }
  const applied = withCueEdits(applyWordOverrides(projection.words, projection.indices, captions.wordOverrides, projection.wordRefs), captions.cueEdits);
  const pages = paginate(applied.words, captions.pacing, effectivePreset(captions).wordsPerPage, applied.breakBefore, CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_VISUAL_LINES);
  let cursor = 0;
  return pages.map((page) => {
    const wordRefs = applied.wordRefs.slice(cursor, cursor + page.words.length);
    const srcIdxs = applied.indices.slice(cursor, cursor + page.words.length).filter((index) => index >= 0);
    cursor += page.words.length;
    return { id: pageId('single', wordRefs, page), laneId: 'single', laneOrder: 0, page, srcIdxs, wordRefs, manual: false };
  });
}

// Rightmost page whose start has passed (each lane is start-ordered by
// buildCaptionPages), -1 when none. Binary search replaces the per-frame
// reverse linear scan: O(pages) → O(log pages) per animation tick.
function lastStartedIndex(lane: readonly CaptionPageIdentity[], ms: number): number {
  let lo = 0;
  let hi = lane.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lane[mid].page.start <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function activeCaptionPages(pages: readonly CaptionPageIdentity[], ms: number): CaptionPageIdentity[] {
  // Group by lane with plain push — the previous [...(lane ?? []), page] copy
  // was O(n²) array churn per call (the hot per-frame lookup path).
  const byLane = new Map<string, CaptionPageIdentity[]>();
  for (const page of pages) {
    const lane = byLane.get(page.laneId);
    if (lane) lane.push(page);
    else byLane.set(page.laneId, [page]);
  }
  return [...byLane.values()].flatMap((lane) => {
    if (lane[0]?.manual) {
      // Manual cues may overlap: the latest started page wins while on screen;
      // walk back over expired ones (same result as the reverse linear find).
      let i = lastStartedIndex(lane, ms);
      while (i >= 0) {
        const candidate = lane[i];
        if (ms < candidate.page.end) return [candidate];
        i -= 1;
      }
      return [];
    }
    const i = lastStartedIndex(lane, ms);
    if (i < 0) return [];
    const active = lane[i].page;
    const until = lane[i + 1]?.page.start ?? active.end + LINGER_MS;
    return ms < until ? [lane[i]] : [];
  }).sort((left, right) => left.laneOrder - right.laneOrder || left.id.localeCompare(right.id));
}
