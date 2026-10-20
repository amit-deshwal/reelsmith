// reels_restyle_text: give one on-screen line another director text style ("make 'priorities sorted' a marker
// highlight"), keeping when it shows. The line is rebuilt by the style's own code, on the song's beats, so it looks
// exactly as if the director had chosen that style; before this the agent duplicated a text item and hand-copied props.
import type { PlanValue } from '../../../shared/reelsmith/directorPlan';
import type { AtomicAction } from '../../editor/reducerActions';
import type { TimelineItem, TimelineState } from '../../editor/types';
import { resolveParams, tagLine } from '../director/assembleDirector';
import { textStyleById, TEXT_STYLES } from '../director/moves';
import { isClipTextStyle } from '../director/textStyles';
import type { TextContext } from '../director/basicTextStyles';
import { findMusicItem, readBeatGrid, timelineBeatFrames } from '../beatSnap';

export interface RestyleArgs { text?: string; itemIds?: string[]; style: string; newText?: string; params?: Record<string, PlanValue> }

const norm = (s: unknown) => (typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, ' ').trim() : '');
const isLineItem = (i: TimelineItem) => i.kind === 'text' || i.kind === 'motion-graphic';
const lineWords = (i: TimelineItem) => norm(i.props?.rsLineText ?? i.props?.text);
const isCutout = (i: TimelineItem) => (i.effects ?? []).some((e) => e.assetId === 'builtin:fx-person-cutout');

/** Effects that draw a line inside the picture (behind-you, landscape-title, follow-tag), by asset id. */
function clipTextAssets(): Set<string> {
  const ctx = { W: 1080, H: 1920, fps: 30, start: 0, end: 30, beats: 1, text: 'x', params: {}, seed: 1, beatFrame: () => 0, id: () => 'x', lane: () => 'T1', emit: () => {}, warn: () => {} } as TextContext;
  return new Set(TEXT_STYLES.filter(isClipTextStyle).map((s) => s.clipEffect({ ...ctx, params: resolveParams(s.params, {}, '', []) }).assetId));
}

export function parseRestyleArgs(raw: Record<string, unknown>): RestyleArgs | { error: string } {
  const style = typeof raw.style === 'string' ? raw.style.trim() : '';
  if (!textStyleById(style)) return { error: `unknown text style "${style}" (use a text style id from the reels-director catalogue, e.g. highlight, slam, caption)` };
  const text = typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim() : undefined;
  const itemIds = Array.isArray(raw.itemIds) ? raw.itemIds.filter((x): x is string => typeof x === 'string' && !!x) : undefined;
  if (!text && !itemIds?.length) return { error: 'name the line: text (its words as they read now) or itemIds' };
  const params = raw.params && typeof raw.params === 'object' ? Object.fromEntries(Object.entries(raw.params as Record<string, unknown>).filter((e): e is [string, PlanValue] => ['string', 'number', 'boolean'].includes(typeof e[1]))) : undefined;
  return { style, ...(text ? { text } : {}), ...(itemIds?.length ? { itemIds } : {}), ...(typeof raw.newText === 'string' && raw.newText.trim() ? { newText: raw.newText.trim() } : {}), ...(params ? { params } : {}) };
}

/** The items of the line: the named ones or those whose words match, plus every item tagged with the same line. */
export function findLine(state: TimelineState, a: RestyleArgs): { items: TimelineItem[]; text: string } | { error: string } {
  const fx = clipTextAssets();
  const want = norm(a.text);
  const inPicture = (i: TimelineItem) => (i.kind === 'video' || i.kind === 'image') && !isCutout(i) && (i.effects ?? []).some((e) => fx.has(e.assetId)) && typeof i.props?.rsFxText === 'string';
  const hit = state.items.filter((i) => (a.itemIds?.some((id) => i.id === id || i.id.startsWith(id)))
    || (want && ((isLineItem(i) && lineWords(i).includes(want)) || (inPicture(i) && norm(i.props!.rsFxText).includes(want)))));
  if (!hit.length) {
    const lines = [...new Set(state.items.filter(isLineItem).map((i) => `"${String(i.props?.rsLineText ?? i.props?.text ?? '').replace(/\s+/g, ' ').trim()}" at ${(i.startFrame / state.fps).toFixed(1)} s`).filter((x) => !x.startsWith('""')))];
    return { error: `no line ${a.text ? `"${a.text}"` : a.itemIds!.join(', ')} on the timeline; lines: ${lines.slice(0, 12).join('; ') || 'none'}` };
  }
  const keys = new Set(hit.map((i) => i.props?.rsLine).filter((k): k is string => typeof k === 'string'));
  const items = state.items.filter((i) => hit.includes(i) || (isLineItem(i) && keys.has(String(i.props?.rsLine))));
  const first = items.find(isLineItem);
  const text = String(first?.props?.rsLineText ?? first?.props?.text ?? items.find(inPicture)?.props?.rsFxText ?? a.text ?? '').replace(/\s+/g, ' ').trim();
  return { items, text };
}

/** Beat clock over the line's span: the song's beats on the timeline, or 0.5 s beats without a song. */
function beatClock(state: TimelineState, from: number, to: number) {
  const music = findMusicItem(state);
  const grid = readBeatGrid(music);
  const frames = music && grid ? timelineBeatFrames(music, grid, state.fps, 1) : [];
  const k0 = frames.findIndex((f) => f >= from - 1);
  if (k0 < 0 || frames.length - k0 < 2) {
    const beat = state.fps / 2;
    return { beats: (to - from) / beat, beatFrame: (b: number) => Math.min(to, Math.round(from + b * beat)) };
  }
  const at = (b: number) => {
    const i = Math.floor(b), t = b - i;
    const a = frames[Math.min(frames.length - 1, k0 + i)]!, c = frames[Math.min(frames.length - 1, k0 + i + 1)] ?? a;
    return Math.round(a + (c - a) * t);
  };
  return { beats: frames.filter((f) => f >= frames[k0]! && f < to).length || 1, beatFrame: (b: number) => Math.min(to, Math.max(from, at(b))) };
}

export interface RestylePlan { actions: AtomicAction[]; text: string; from: number; to: number; removed: number; warnings: string[] }

export function planRestyle(state: TimelineState, a: RestyleArgs, newId: () => string): RestylePlan | { error: string } {
  const style = textStyleById(a.style)!;
  const errors: string[] = [];
  const params = resolveParams(style.params, a.params, 'params', errors);
  if (errors.length) return { error: errors.join('; ') };
  const line = findLine(state, a);
  if ('error' in line) return line;
  const text = a.newText ?? line.text;
  if (!text) return { error: 'the line has no words to restyle; pass newText' };
  if (text.length > style.maxChars) return { error: `"${text}" is ${text.length} characters; ${style.id} takes ${style.maxChars} at most (shorten it with newText or pick another style)` };
  const from = Math.min(...line.items.map((i) => i.startFrame));
  const to = Math.max(...line.items.map((i) => i.startFrame + i.durationInFrames));
  const fx = clipTextAssets();
  const actions: AtomicAction[] = [];
  const warnings: string[] = [];
  // take the old line off: its text items, and an in-picture line's effect on the clips under it
  for (const i of line.items) {
    if (isLineItem(i)) actions.push({ type: 'remove', id: i.id });
    else {
      actions.push({ type: 'setEffects', id: i.id, effects: (i.effects ?? []).filter((e) => !fx.has(e.assetId)) });
      actions.push({ type: 'updateProps', id: i.id, patch: { rsFxText: undefined } });
    }
  }
  const key = String(line.items.find((i) => typeof i.props?.rsLine === 'string')?.props?.rsLine ?? `r${newId()}`);
  const behind = line.items.some((i) => i.props?.rsBehind === true);
  const clock = beatClock(state, from, to);
  const ctx: TextContext = {
    W: state.width, H: state.height, fps: state.fps, start: from, end: to, beats: clock.beats, beatFrame: clock.beatFrame, text, params, seed: 1,
    id: (...parts) => `rs-rt-${newId()}-${parts.join('-')}`,
    // the first lane is the old line's own track; a style with more lanes gets new tracks above everything
    lane: (n) => (n === 0 ? line.items.find(isLineItem)?.track ?? `RSLINE${n}` : `RSLINE${n}`),
    emit: (x) => actions.push(tagLine(behind && x.type === 'add' ? { ...x, item: { ...x.item, props: { ...(x.item.props ?? {}), rsBehind: true } } } as AtomicAction : x, key, text, style.id)),
    warn: (m) => warnings.push(m),
  };
  if (isClipTextStyle(style)) {
    const effect = style.clipEffect(ctx);
    const under = state.items.filter((i) => (i.kind === 'video' || i.kind === 'image') && !isCutout(i) && i.startFrame < to && i.startFrame + i.durationInFrames > from);
    if (!under.length) return { error: `${style.id} is drawn inside the picture and needs a clip under the line (${(from / state.fps).toFixed(1)}-${(to / state.fps).toFixed(1)} s)` };
    for (const i of under) {
      const kept = line.items.includes(i) ? (i.effects ?? []).filter((e) => !fx.has(e.assetId)) : (i.effects ?? []);
      actions.push({ type: 'setEffects', id: i.id, effects: [...kept, { id: `textfx-${newId()}`, assetId: effect.assetId, overrides: { ...effect.overrides } }] });
      actions.push({ type: 'updateProps', id: i.id, patch: { rsFxText: text } });
    }
  } else {
    style.build(ctx);
  }
  if (behind && isClipTextStyle(style)) warnings.push('the line was behind the person; an in-picture style ignores that');
  return { actions, text, from, to, removed: line.items.filter(isLineItem).length, warnings };
}
