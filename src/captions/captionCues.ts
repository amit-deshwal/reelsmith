import type { TimelineItem } from '../editor/types';
import { buildCaptionPages } from './captionPages';
import type { CaptionsData, CaptionCueEdit, CaptionWordOverride } from './types';
import { joinCaptionWords } from './types';
import { setCaptionWordOverride } from './wordOverrides';

export interface CueRow {
  id: string;
  laneId: string;
  manual: boolean;
  start: number;
  end: number;
  text: string;
  /** The key of the visible word in this sentence in the wordOverrides index space */
  srcIdxs: number[];
  /** Stable identities aligned with srcIdxs. */
  wordRefs: string[];
}

export function fmtCueMs(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

/** Renders a paged recalculation of SingleStreamCaptions, but retains the override keys for each visible word.*/
export function buildCues(captions: CaptionsData, items: TimelineItem[], fps: number): CueRow[] {
  return buildCaptionPages(captions, items, fps).map((identity) => ({
    id: identity.id,
    laneId: identity.laneId,
    manual: identity.manual,
    start: identity.page.start,
    end: identity.page.end,
    text: joinCaptionWords(identity.page.words),
    srcIdxs: identity.srcIdxs,
    wordRefs: identity.wordRefs,
  }));
}

/** Translate the text changes in sentence k into wordOverrides patches.*/
export function cueTextPatch(
  captions: CaptionsData,
  rows: CueRow[],
  index: number,
  text: string,
): Partial<CaptionsData> | null {
  const cue = rows[index];
  if (!cue || cue.srcIdxs.length === 0) return null;
  const allIndices = rows.flatMap((row) => row.srcIdxs);
  let next: Record<number, CaptionWordOverride> = { ...(captions.wordOverrides ?? {}) };
  const put = (source: number, wordRef: string, patch: CaptionWordOverride) => {
    next = setCaptionWordOverride(next, allIndices, source, wordRef, patch);
  };
  const trimmed = text.trim();
  const tokens = trimmed.match(/\S+/gu) ?? [];
  const sourceWords = cue.wordRefs.map((ref) => {
    const prior = captions.cueEdits?.[ref]?.words;
    return prior?.find((word) => word.sourceRef === ref)?.text;
  }).filter((word): word is string => !!word);
  const matchingWords = sourceWords.length === cue.wordRefs.length
    ? sourceWords
    : cue.text.match(/\S+/gu) ?? [];
  // LCS keeps exact source word timings where text is unchanged. Unmatched
  // tokens are assigned to the gap between their nearest preserved anchors.
  const dp = Array.from({ length: matchingWords.length + 1 }, () => Array(tokens.length + 1).fill(0));
  for (let i = matchingWords.length - 1; i >= 0; i--) for (let j = tokens.length - 1; j >= 0; j--) {
    dp[i]![j] = matchingWords[i]!.toLocaleLowerCase() === tokens[j]!.toLocaleLowerCase()
      ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const pairs = new Map<number, number>();
  for (let i = 0, j = 0; i < matchingWords.length && j < tokens.length;) {
    if (matchingWords[i]!.toLocaleLowerCase() === tokens[j]!.toLocaleLowerCase()) { pairs.set(j, i); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++; else j++;
  }
  const editWords: CaptionCueEdit['words'] = [];
  for (let j = 0; j < tokens.length; j++) {
    const sourcePosition = pairs.get(j);
    if (sourcePosition !== undefined) {
      editWords.push({ text: tokens[j]!, sourceRef: cue.wordRefs[sourcePosition]! });
      continue;
    }
    let before: number | undefined; let after: number | undefined;
    for (let k = j - 1; k >= 0 && before === undefined; k--) before = pairs.get(k);
    for (let k = j + 1; k < tokens.length && after === undefined; k++) after = pairs.get(k);
    const gap = editWords.filter((word) => !word.sourceRef && word.beforeRef === (before === undefined ? undefined : cue.wordRefs[before]) && word.afterRef === (after === undefined ? undefined : cue.wordRefs[after]));
    editWords.push({ text: tokens[j]!, ...(before === undefined ? {} : { beforeRef: cue.wordRefs[before] }), ...(after === undefined ? {} : { afterRef: cue.wordRefs[after] }), insertionIndex: gap.length, insertionCount: tokens.slice(j).filter((_, tokenIndex) => !pairs.has(tokenIndex) && (after === undefined || tokenIndex < after)).length });
  }
  // Clearing a cue hides its source words; with no edit record they would otherwise reappear.
  if (!tokens.length) cue.srcIdxs.forEach((source, position) => put(source, cue.wordRefs[position]!, { hidden: true }));
  const cueEdits = { ...(captions.cueEdits ?? {}) };
  const editKey = cue.wordRefs[0]!;
  if (editKey) {
    if (tokens.length) cueEdits[editKey] = { sourceRefs: [...cue.wordRefs], words: editWords };
    else delete cueEdits[editKey];
  }
  const nextFirst = rows[index + 1]?.srcIdxs[0];
  const nextRef = rows[index + 1]?.wordRefs[0];
  if (nextFirst !== undefined && nextRef) put(nextFirst, nextRef, { forceBreak: true });
  return { wordOverrides: next, cueEdits };
}
