// travel-diary@1: a fixed 8-bar trip edit on the user's song. Three half-beat flash cuts open it, six shots play
// (8, 8, 4, 4, 3.5 and 2.5 beats), the next shot breaks in four times (tall bars, wide bars, tall bars, a window that
// grows in steps) and three flash cuts close it. The user's line shows one word at a time on the beat in five
// stretches, in big white serif capitals. All times are in beats of the song, so the edit follows any tempo.
// Clips are reused (at a different moment) when there are fewer than 12, never in two neighbouring slots.
import type { AtomicAction } from '../../editor/reducerActions';
import { REVEAL_FRAG, REVEAL_LABELS, revealUniforms, type RevealKind } from '../travelDiaryReveal';
import { musicFadeFrames } from '../musicPolicy';
import { dbToGain, fpsOf, textItem } from './common';
import { castSlots, planToOrder } from './casting';
import { musicStartSec } from './beatMontage';
import { stableId } from './rng';
import type { AssembleInput, AssembleResult, AssemblyClip } from './types';

export interface DiarySlot { part: string; from: number; to: number; flash?: boolean }

/** Slot times in beats from the reel start. Back to back from 0 to 32 beats (8 bars). */
export const DIARY_SLOTS: readonly DiarySlot[] = [
  { part: 'intro A', from: 0, to: 0.5, flash: true },
  { part: 'intro B', from: 0.5, to: 1, flash: true },
  { part: 'intro C', from: 1, to: 1.5, flash: true },
  { part: 'shot 1', from: 1.5, to: 8 },
  { part: 'shot 2', from: 8, to: 16 },
  { part: 'shot 3', from: 16, to: 20 },
  { part: 'shot 4', from: 20, to: 24 },
  { part: 'shot 5', from: 24, to: 27.5 },
  { part: 'shot 6', from: 27.5, to: 30 },
  { part: 'outro A', from: 30, to: 30.5, flash: true },
  { part: 'outro B', from: 30.5, to: 31, flash: true },
  { part: 'outro C', from: 31, to: 32 },
];
export const DIARY_BEATS = 32;

/** The four break-ins: the slot that comes in, and how. Each starts REVEAL_LEAD beats before that slot. */
export const DIARY_REVEALS: ReadonlyArray<{ into: number; kind: RevealKind }> = [
  { into: 4, kind: 'tall' }, { into: 5, kind: 'wide' }, { into: 6, kind: 'tall' }, { into: 7, kind: 'window' },
];
export const REVEAL_LEAD = 2.75;
/** Landing beats from the reveal start: the five bars land on half-beats; the window grows on the last four. */
const BAR_LANDS = [0.25, 0.75, 1.25, 1.75, 2.25];
const WINDOW_LANDS = [0.75, 1.25, 1.75, 2.25];

/** Five word stretches in beats, and how many words each holds at most. */
export const WORD_STRETCHES: ReadonlyArray<{ from: number; to: number; max: number }> = [
  { from: 1.75, to: 6, max: 6 }, { from: 8.5, to: 14.5, max: 6 }, { from: 16.5, to: 18.5, max: 3 },
  { from: 20.5, to: 22.5, max: 3 }, { from: 24.5, to: 30, max: 5 },
];

const WORD_STYLE = { fontFamily: 'Libre Baskerville', fontWeight: 400, sizePx: 132, color: '#FFFFFF', textTransform: 'uppercase' };

/**
 * The user's line as five phrases. "/" or new lines split it by hand; otherwise the words are shared out so the long
 * stretches get more, preferring breaks after punctuation. Returns the phrases (word arrays) and what was left out.
 */
export function splitPhrases(line: string): { phrases: string[][]; dropped: string[] } {
  const clean = (s: string) => s.replace(/[{}]/g, '').split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const caps = WORD_STRETCHES.map((s) => s.max);
  if (/[/\n]/.test(line)) {
    const parts = line.split(/[/\n]/).map(clean).filter((p) => p.length);
    const phrases = caps.map((cap, i) => (parts[i] ?? []).slice(0, cap));
    const dropped = [...parts.slice(0, 5).flatMap((p, i) => p.slice(caps[i]!)), ...parts.slice(5).flat()];
    return { phrases, dropped };
  }
  const words = clean(line);
  if (words.length <= 5) return { phrases: caps.map((_, i) => (words[i] ? [words[i]!] : [])), dropped: [] };
  const total = caps.reduce((a, b) => a + b, 0);
  const kept = words.slice(0, total);
  // share the words out by room: each next word goes to the stretch that is least full (ties: 1, 2, 5, 3, 4)
  const counts = caps.map(() => 0);
  const order = [0, 1, 4, 2, 3];
  for (let n = 0; n < kept.length; n += 1) {
    const i = [...order].sort((a, b) => counts[a]! / caps[a]! - counts[b]! / caps[b]! || order.indexOf(a) - order.indexOf(b)).find((k) => counts[k]! < caps[k]!)!;
    counts[i]! += 1;
  }
  const phrases: string[][] = [];
  let at = 0;
  for (const c of counts) { phrases.push(kept.slice(at, at + c)); at += c; }
  return { phrases, dropped: words.slice(total) };
}

/** Beat time (seconds from the reel start) for fractional beat `b`; the grid is extended at its tempo if the song ends. */
function beatClock(rel: number[]): (b: number) => number {
  const period = rel.length > 1 ? (rel[rel.length - 1]! - rel[0]!) / (rel.length - 1) : 0.5;
  const at = (i: number) => (i < rel.length ? rel[i]! : rel[rel.length - 1]! + (i - rel.length + 1) * period);
  return (b) => { const i = Math.floor(b); return at(i) + (b - i) * (at(i + 1) - at(i)); };
}

type Range = [number, number];

/** Source start (frames) for `len` frames of `clip`, away from `used` ranges by `gap`, inside one camera shot. */
export function pickMoment(clip: AssemblyClip, len: number, used: Range[], gap: number): number | null {
  if (clip.kind === 'image') return 0;
  const end = Math.floor(clip.durationInFrames);
  const pad = 6;
  const a = clip.sourceAnalysis;
  const bounds = [0, ...(a?.shotBoundariesFrame ?? []).filter((f) => f > 0 && f < end), end].sort((x, y) => x - y);
  const score = (s: number): number => {
    if (a?.windows.length) {
      return a.windows.reduce((sum, w) => sum + Math.max(0, Math.min(s + len, w.endFrame) - Math.max(s, w.startFrame)) * w.score, 0) / len;
    }
    return 1 - Math.abs(s - (clip.bestStartFrame ?? 0)) / Math.max(1, end);
  };
  const clear = (s: number, g: number) => used.every(([u0, u1]) => s + len + g <= u0 || s >= u1 + g);
  for (const g of [gap, 0]) {
    let best: { s: number; v: number } | null = null;
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const lo = bounds[i]! + (i > 0 ? pad : 0);
      const hi = bounds[i + 1]! - (i < bounds.length - 2 ? pad : 0) - len;
      for (let s = lo; s <= hi; s += 3) {
        if (!clear(s, g)) continue;
        const v = score(s);
        if (!best || v > best.v + 1e-9) best = { s, v };
      }
    }
    if (best) return best.s;
  }
  return null;
}

interface Placed { slot: number; clip: AssemblyClip; srcVisible: number }

export function assembleTravelDiary(input: AssembleInput): AssembleResult {
  const { recipe, params, seed, texts } = input;
  const fps = fpsOf(recipe);
  const warnings: string[] = [];
  const run = {
    recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy, seed, params, texts,
    assetIds: input.clips.map((c) => c.assetId).sort(),
  };
  const fail = (msg: string): AssembleResult => {
    warnings.push(msg);
    return { action: null, run, report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings } };
  };
  const music = input.music;
  if (!music || music.beatTimesSec.length < 2) return fail('This recipe needs a song with a steady beat.');
  const clips = input.clips.filter((c) => c.kind === 'image' || c.durationInFrames > fps * 0.5);
  if (clips.length < 3) return fail(`Add at least 3 clips or photos (have ${clips.length}).`);

  const startSec = musicStartSec(recipe, music, params);
  const rel = music.beatTimesSec.filter((b) => b >= startSec - 1e-3).map((b) => b - startSec);
  if (rel.length < 2) return fail('The song has no beats after the chosen start.');
  const beat = beatClock(rel);
  const songLeft = music.durationSec - startSec;
  if (beat(DIARY_BEATS) > songLeft + 0.05) warnings.push(`The song ends ${(beat(DIARY_BEATS) - songLeft).toFixed(1)} s before the reel; start the song earlier or use a longer one.`);
  const frame = (b: number) => (b <= 0 ? 0 : Math.round(beat(b) * fps));
  const slotFrames = DIARY_SLOTS.map((s) => [frame(s.from), frame(s.to)] as const);
  const total = slotFrames[slotFrames.length - 1]![1];

  // reveal lengths (frames) keyed by incoming slot
  const reveal = new Map<number, { kind: RevealKind; L: number; landSec: number[] }>();
  for (const r of DIARY_REVEALS) {
    const cut = DIARY_SLOTS[r.into]!.from;
    const L = frame(cut) - frame(cut - REVEAL_LEAD);
    const lands = (r.kind === 'window' ? WINDOW_LANDS : BAR_LANDS).map((o) => beat(cut - REVEAL_LEAD + o) - beat(cut - REVEAL_LEAD));
    reveal.set(r.into, { kind: r.kind, L, landSec: lands });
  }
  // visible source span of each slot: from the start of its incoming reveal (it shows inside the bars) to its end
  const visible = DIARY_SLOTS.map((_, i) => [slotFrames[i]![0] - (reveal.get(i)?.L ?? 0), slotFrames[i]![1]] as Range);

  // cast the slots: fewest uses first, then the agent's order (validated picks, unique clips) or the score,
  // never the clip of the slot before
  const pref = input.preferredAssetIds ?? [];
  const rank = (c: AssemblyClip) => (pref.includes(c.assetId) ? pref.indexOf(c.assetId) : pref.length);
  // RS-109: with shot tags (and no agent picks) the clips are cast by what they show: the opener on shot 1,
  // the closer on the last slot, neighbours of different kinds
  const cast = !pref.length && (recipe.casting || clips.some((c) => c.shot))
    ? castSlots(clips, DIARY_SLOTS.length, recipe.casting ?? {}, { openerSlot: 3, closerSlot: DIARY_SLOTS.length - 1, chronological: false, fixedSlots: true }) : null;
  if (cast) warnings.push(cast.note);
  const castOrder = cast ? planToOrder(cast) : [];
  const ranked = cast
    ? [...castOrder, ...clips.filter((c) => !castOrder.includes(c))]
    : [...clips].sort((x, y) => rank(x) - rank(y) || y.score - x.score || x.assetId.localeCompare(y.assetId));
  const uses = new Map<string, Range[]>();
  const placed: Placed[] = [];
  for (let i = 0; i < DIARY_SLOTS.length; i += 1) {
    const len = visible[i]![1] - visible[i]![0];
    const prev = placed[i - 1]?.clip.assetId;
    const order = [...ranked].sort((x, y) => (uses.get(x.assetId)?.length ?? 0) - (uses.get(y.assetId)?.length ?? 0));
    const tryOrder = order.filter((c) => c.assetId !== prev);
    const d = cast?.designated.get(i);
    const at = d ? tryOrder.indexOf(d) : -1;
    if (at > 0) tryOrder.unshift(...tryOrder.splice(at, 1));
    let got: Placed | null = null;
    for (const c of tryOrder) {
      const s = pickMoment(c, len, uses.get(c.assetId) ?? [], Math.round(fps * 0.5));
      if (s === null) continue;
      got = { slot: i, clip: c, srcVisible: s };
      break;
    }
    if (!got) return fail(`No clip is long enough for ${DIARY_SLOTS[i]!.part} (${(len / fps).toFixed(1)} s). Add longer clips.`);
    uses.set(got.clip.assetId, [...(uses.get(got.clip.assetId) ?? []), [got.srcVisible, got.srcVisible + len]]);
    placed.push(got);
  }
  if (clips.length < DIARY_SLOTS.length) warnings.push(`${clips.length} clips for 12 slots: some clips are used more than once, at different moments.`);

  const tag = `${recipe.id}@${recipe.version}`;
  const clipGain = params.clipAudio === true ? -14 : -96;
  const actions: AtomicAction[] = [];
  const ids: string[] = [];
  placed.forEach((p, i) => {
    const r = reveal.get(i);
    const rNext = reveal.get(i + 1);
    // a reveal of L frames is centred on the item boundary: put the boundary L - floor(L/2) before the cut
    const start = slotFrames[i]![0] - (r ? r.L - Math.floor(r.L / 2) : 0);
    const end = slotFrames[i]![1] - (rNext ? rNext.L - Math.floor(rNext.L / 2) : 0);
    const id = stableId('rs', tag, seed, 'slot', i);
    ids.push(id);
    const video = p.clip.kind === 'video';
    actions.push({
      type: 'add', startFrame: start,
      item: {
        id, track: 'V1', kind: p.clip.kind, name: `${i + 1} · ${DIARY_SLOTS[i]!.part} · ${p.clip.name}`, src: p.clip.src,
        durationInFrames: end - start, sourceAssetId: p.clip.assetId,
        ...(video ? { srcInFrame: p.srcVisible + (start - visible[i]![0]), volume: dbToGain(clipGain) } : {}),
        props: { rsSection: DIARY_SLOTS[i]!.flash ? 'flash' : 'shots', rsRun: tag },
      } as never,
    });
  });
  DIARY_REVEALS.forEach((rv, n) => {
    const r = reveal.get(rv.into)!;
    actions.push({
      type: 'addTransition', id: stableId('rs-tr', tag, seed, n), incomingItemId: ids[rv.into]!, transType: 'custom-shader', durationInFrames: r.L,
      custom: { frag: REVEAL_FRAG, uniforms: revealUniforms(r.kind, r.landSec, r.L / fps), label: REVEAL_LABELS[r.kind] },
    });
  });

  // words: one at a time on the beat, each held until the next
  const line = renderLine(texts.line ?? '');
  const { phrases, dropped } = splitPhrases(line);
  if (dropped.length) warnings.push(`The line was too long; left out: "${dropped.join(' ')}".`);
  phrases.forEach((words, k) => {
    if (!words.length) return;
    const st = WORD_STRETCHES[k]!;
    const step = Math.max(0.5, Math.floor(((st.to - st.from) / words.length) * 2) / 2);
    words.forEach((w, j) => {
      const b0 = st.from + j * step;
      const b1 = j === words.length - 1 ? st.to : b0 + step;
      const f0 = frame(b0);
      const act = textItem(stableId('rs-w', tag, seed, k, j), w, f0, Math.max(1, frame(b1) - f0), recipe.canvas, WORD_STYLE, 0, 'V2');
      (act as { item: { props: Record<string, unknown> } }).item.props.rsSection = 'words';
      actions.push(act);
    });
  });

  const fade = musicFadeFrames(recipe, fps, total, 'fadeOut');
  actions.push({
    type: 'add', startFrame: 0,
    item: {
      id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
      durationInFrames: total, srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId,
      volume: dbToGain(recipe.music?.gainDb ?? 0), ...(fade > 0 ? { fadeOutFrames: fade } : {}),
    } as never,
  });

  return {
    action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, run,
    report: { shots: placed.length, usedAssetIds: [...new Set(placed.map((p) => p.clip.assetId))], musicStartSec: startSec, totalFrames: total, warnings },
  };
}

/** Emoji and template braces are dropped; the template font draws Latin text, digits and common punctuation. */
function renderLine(raw: string): string {
  return raw.replace(/[{}]/g, '').replace(/\p{Extended_Pictographic}/gu, '').trim();
}
