// postcard-collage@1: a fixed 22.1 s 16:9 trip film on black, in four parts.
//   Opener (0-3.6 s): a wide shot with a person; six tall strips of other clips appear left to right, the person stays
//     in front of them, flashes white and vanishes, then black bars close the picture in three steps.
//   Title (4.1 s to the end): two small white words, then the place's letters shuffle and settle into big red capitals.
//   Postcards (5.9-13.3 s): 59 fast cuts through every clip, seen through a band that opens at a constant rate.
//   Finale (13.3-22.1 s): bands, three tall cards, a six-window grid, and a panorama that shuts into a line.
// Every time is in seconds of the film, not beats: the cuts are the recipe. The strips and the finale are motion
// graphics (postcardGraphics.ts); everything else is ordinary clips, solids and text, one track per layer.
import type { AtomicAction } from '../../editor/reducerActions';
import type { Keyframe } from '../../editor/types';
import { FINALE_GRID_FROM_SEC, FINALE_NEEDS_SEC, FINALE_ROLES, finaleWindows, POSTCARD_GRAPHIC_CODE, stripWindows, type FinaleRole, type GraphicSource } from '../postcardGraphics';
import { focusForRange } from '../titleClear';
import { musicFadeFrames } from '../musicPolicy';
import { dbToGain, fpsOf } from './common';
import { musicStartSec } from './beatMontage';
import { pickMoment } from './travelDiary';
import { makeRng, stableId } from './rng';
import type { AssembleInput, AssembleResult, AssemblyClip } from './types';

export const PC = {
  end: 22.1,
  openerEnd: 3.6,
  stripsAt: [0.18, 0.35, 0.52, 0.68, 0.85, 1.05],
  flash: [1.433, 1.517],
  wordsAt: 4.1,
  scramble: [4.5, 5.4],
  placeAt: 5.4,
  fadeSec: 0.3,
  postcards: [5.9, 13.3],
  finaleAt: 13.3,
} as const;

/** Fraction of the frame's height each closing bar covers, [film second, fraction]: three quick steps with holds. */
export const BAR_STEPS: ReadonlyArray<readonly [number, number]> = [
  [2.33, 0], [2.43, 0.06], [2.53, 0.12], [2.6, 0.165], [2.88, 0.165], [2.96, 0.22], [3.04, 0.28], [3.1, 0.33],
  [3.34, 0.33], [3.42, 0.39], [3.49, 0.45], [3.55, 0.5],
];

/** Each black bar of the postcards' band: half the frame at 5.85 s, opening at a constant rate (same as the finale). */
export const bandCover = (sec: number) => Math.max(0, 0.5 - (sec - 5.85) * 0.0632);

/** Postcard lengths in frames at 30 fps: one long and three short, every half second. */
const CUT_PATTERN_30 = [6, 3, 3, 3];

/** Postcard cut frames [start, end) from 5.9 to 13.3 s. */
export function postcardCuts(fps: number): Array<[number, number]> {
  const from = Math.round(PC.postcards[0] * fps);
  const to = Math.round(PC.postcards[1] * fps);
  const cuts: Array<[number, number]> = [];
  for (let f = from, i = 0; f < to; i += 1) {
    const len = Math.max(1, Math.round((CUT_PATTERN_30[i % 4]! * fps) / 30));
    cuts.push([f, Math.min(to, f + len)]);
    f += len;
  }
  return cuts;
}

/**
 * Lanes, bottom to top. Each layer has its own lane, and so does every pair of items that are on screen together (a
 * lane holds one item at a time); trackBinding stacks V lanes by number, then the T lanes above them.
 */
export const L = {
  bg: 'V1', opener: 'V2', strips: 'V3', person: 'V4', barTop: 'V5', barBottom: 'V6', cards: 'V7', bandTop: 'V8',
  bandBottom: 'V9', finale: 'V10', wordLeft: 'T1', wordRight: 'T2', place: 'T3',
} as const;

const PERSON_TAGS = ['people', 'posing', 'portrait', 'action', 'laughing', 'dancing', 'celebrating'];
const WIDE_TAGS = ['scenery', 'water', 'city'];
const DETAIL_TAGS = ['food', 'detail', 'people', 'city', 'portrait'];

export interface PostcardCast {
  opener: AssemblyClip;
  strips: AssemblyClip[];
  finale: Record<FinaleRole, AssemblyClip>;
}

const tagOf = (c: AssemblyClip) => c.shot?.top;
const lenSec = (c: AssemblyClip, fps: number) => (c.kind === 'image' ? Infinity : c.durationInFrames / fps);
const portrait = (c: AssemblyClip) => (c.height ?? 0) > (c.width ?? 0);
/** A face or subject box this wide or this big means a close-up, not a person standing in a view. */
export const isCloseUp = (r: { w: number; h: number }) => r.w > 0.28 || r.w * r.h > 0.15;
/** 1: a person-sized face or subject somewhere in the clip; 0: only close-ups; 0.5: nothing measured. */
const personSized = (c: AssemblyClip) => {
  const rects = (c.sourceAnalysis?.windows ?? []).flatMap((w) => (w.focusRect ? [w.focusRect] : []));
  return !rects.length ? 0.5 : rects.some((r) => !isCloseUp(r)) ? 1 : 0;
};

/**
 * Who goes where. Opener: a video with people in it (else the best video). Closer: the best wide video, not the
 * opener. Top and middle: other wide videos. Strips: tall subjects; portrait clips and photos first, never the opener.
 * Grid: details. Every slot gets its own clip while there are enough; then the best clips are reused.
 */
export function castPostcards(clips: AssemblyClip[], fps: number, preferred: string[] = [], openerId?: string): PostcardCast {
  const rank = (c: AssemblyClip) => (preferred.includes(c.assetId) ? preferred.indexOf(c.assetId) : preferred.length);
  const ranked = [...clips].sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.assetId.localeCompare(b.assetId));
  const used = new Map<string, number>();
  const take = (want: (c: AssemblyClip) => number, avoid: AssemblyClip[] = []): AssemblyClip => {
    const pool = ranked.filter((c) => !avoid.includes(c));
    const best = [...(pool.length ? pool : ranked)].sort((a, b) =>
      (used.get(a.assetId) ?? 0) - (used.get(b.assetId) ?? 0) || want(b) - want(a) || ranked.indexOf(a) - ranked.indexOf(b))[0]!;
    used.set(best.assetId, (used.get(best.assetId) ?? 0) + 1);
    return best;
  };
  const video = (c: AssemblyClip) => (c.kind === 'video' ? 1 : 0);
  const long = (c: AssemblyClip, sec: number) => (lenSec(c, fps) >= sec ? 1 : 0);
  const tagged = (c: AssemblyClip, tags: string[]) => (tags.includes(tagOf(c) ?? '') ? 1 : 0);

  const wide = (c: AssemblyClip) => (portrait(c) ? 0 : 1);
  const chosen = openerId ? ranked.find((c) => c.assetId === openerId) : undefined;
  const opener = take((c) => (c === chosen ? 1000 : 0) + 16 * video(c) + 8 * wide(c) + 4 * tagged(c, PERSON_TAGS) + 6 * personSized(c) + long(c, PC.openerEnd));
  const closer = take((c) => 16 * video(c) + 8 * wide(c) + 4 * tagged(c, WIDE_TAGS) + 2 * long(c, FINALE_NEEDS_SEC.closer), [opener]);
  const top = take((c) => 16 * video(c) + 8 * wide(c) + 4 * tagged(c, WIDE_TAGS) + 2 * long(c, FINALE_NEEDS_SEC.top), [opener, closer]);
  const middle = take((c) => 16 * video(c) + 8 * wide(c) + 4 * tagged(c, WIDE_TAGS) + 2 * long(c, FINALE_NEEDS_SEC.middle), [opener, closer, top]);
  const strips: AssemblyClip[] = [];
  for (let i = 0; i < 6; i += 1) {
    strips.push(take((c) => 4 * (portrait(c) || c.kind === 'image' ? 1 : 0) + 2 * tagged(c, ['people', 'city', 'portrait', 'posing']) + long(c, PC.openerEnd),
      [opener, ...(strips[i - 1] ? [strips[i - 1]!] : [])]));
  }
  const grid: AssemblyClip[] = [];
  for (let i = 0; i < 3; i += 1) grid.push(take((c) => 4 * tagged(c, DETAIL_TAGS) + 2 * (c.kind === 'image' ? 1 : 0) + long(c, 2.8), [top, closer, ...grid]));
  return { opener, strips, finale: { middle, top, closer, grid1: grid[0]!, grid2: grid[1]!, grid3: grid[2]! } };
}

/** Postcard order: every clip in turn, the turn order changing each lap; never one twice running; the last is not `avoidLast`. */
export function postcardOrder(clips: AssemblyClip[], count: number, avoidLast?: AssemblyClip): AssemblyClip[] {
  const n = clips.length;
  const out: AssemblyClip[] = [];
  for (let j = 0; j < count && n; j += 1) {
    const lap = Math.floor(j / n);
    const k = j % n;
    // even laps go forward from a moving start, odd laps backward
    let pick = clips[lap % 2 === 0 ? (k + lap) % n : (n - 1 - k + lap) % n]!;
    const prev = out[j - 1];
    const last = j === count - 1;
    if (n > 1 && (pick === prev || (last && pick === avoidLast))) pick = clips.find((c) => c !== prev && !(last && c === avoidLast)) ?? pick;
    out.push(pick);
  }
  return out;
}

/** The place's letters shuffling into place, one state per frame: letters lock from the left; the last state is the place. */
export function scrambleStates(place: string, frames: number, seed: number): string[] {
  const chars = [...place];
  const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();
  const letters = chars.filter(isLetter);
  if (!letters.length || frames < 2) return [place];
  const rng = makeRng(seed);
  const n = chars.length;
  return Array.from({ length: frames }, (_, k) => {
    const p = k / (frames - 1);
    return chars.map((c, i) => (!isLetter(c) || p >= 0.35 + (0.6 * i) / Math.max(1, n - 1) ? c : letters[Math.floor(rng() * letters.length)]!)).join('');
  });
}

const focusOf = (clip: AssemblyClip, fromFrame: number, toFrame: number): [number, number] | undefined => {
  const r = focusForRange(clip, fromFrame, toFrame);
  return r ? [r.x + r.w / 2, r.y + r.h / 2] : undefined;
};

export function assemblePostcardCollage(input: AssembleInput): AssembleResult {
  const { recipe, params, seed, texts } = input;
  const fps = fpsOf(recipe);
  const W = recipe.canvas.width;
  const H = recipe.canvas.height;
  const f = (sec: number) => Math.round(sec * fps);
  const warnings: string[] = [];
  const run = {
    recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy, seed, params, texts,
    assetIds: input.clips.map((c) => c.assetId).sort(),
  };
  const fail = (msg: string): AssembleResult => {
    warnings.push(msg);
    return { action: null, run, report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings } };
  };
  const clips = input.clips.filter((c) => c.kind === 'image' || c.durationInFrames >= fps * 0.5);
  if (clips.length < 3) return fail(`Add at least 3 clips or photos (have ${clips.length}); 12 or more works best.`);
  if (!clips.some((c) => c.kind === 'video')) return fail('Add at least one video: the opener and the finale play moving footage.');
  const place = (texts.place ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!place) return fail('Type the place for the title.');

  const cast = castPostcards(clips, fps, input.preferredAssetIds, input.openerAssetId);
  if (input.openerAssetId && cast.opener.assetId !== input.openerAssetId) warnings.push('The clip chosen to open the film is not among the selected clips.');
  if (clips.length < 13) warnings.push(`${clips.length} clips for 13 slots: some clips are used twice, at different moments.`);
  const uses = new Map<string, Array<[number, number]>>();
  /** A source start (frames) for `sec` seconds of `clip`, away from its other uses; loops when the clip is too short. */
  const moment = (clip: AssemblyClip, sec: number): { inFrame: number; loop: boolean } => {
    if (clip.kind === 'image') return { inFrame: 0, loop: false };
    const len = f(sec);
    const s = pickMoment(clip, Math.min(len, clip.durationInFrames), uses.get(clip.assetId) ?? [], f(0.5)) ?? 0;
    uses.set(clip.assetId, [...(uses.get(clip.assetId) ?? []), [s, s + len]]);
    return { inFrame: s, loop: clip.durationInFrames - s < len };
  };
  const source = (clip: AssemblyClip, sec: number, fromSec: number): GraphicSource => {
    const m = moment(clip, sec);
    const focus = focusOf(clip, m.inFrame, m.inFrame + f(sec));
    return {
      src: clip.src, kind: clip.kind, width: clip.width ?? W, height: clip.height ?? H,
      inSec: m.inFrame / fps, fromSec, ...(m.loop ? { loop: true } : {}), ...(focus ? { focus } : {}),
    };
  };

  const tag = `${recipe.id}@${recipe.version}`;
  const end = f(PC.end);
  const actions: AtomicAction[] = [];
  const add = (track: string, startFrame: number, item: Record<string, unknown>) =>
    actions.push({ type: 'add', startFrame, item: { track, ...item, props: { rsRun: tag, ...(item.props as object | undefined) } } as never });
  const solid = (id: string, track: string, name: string, from: number, to: number, extra: Record<string, unknown> = {}) =>
    add(track, from, { id, kind: 'solid', name, durationInFrames: Math.max(1, to - from), width: W, height: H, ...extra, props: { color: '#000000', ...(extra.props as object | undefined) } });
  const clipAt = (id: string, track: string, clip: AssemblyClip, from: number, to: number, inFrame: number, extra: Record<string, unknown> = {}) =>
    add(track, from, {
      id, kind: clip.kind, name: clip.name, src: clip.src, sourceAssetId: clip.assetId, durationInFrames: Math.max(1, to - from),
      ...(clip.kind === 'video' ? { srcInFrame: inFrame, volume: 0 } : {}), ...extra,
    });

  solid(stableId('rs-pc', tag, seed, 'bg'), L.bg, 'Black canvas', 0, end);

  // Opener: the wide shot, the strips over it, the person cut out over the strips, then the closing bars
  const openerMoment = moment(cast.opener, PC.openerEnd);
  clipAt(stableId('rs-pc', tag, seed, 'opener'), L.opener, cast.opener, 0, f(PC.openerEnd), openerMoment.inFrame, { props: { rsSection: 'opener' } });
  add(L.strips, 0, {
    id: stableId('rs-pc', tag, seed, 'strips'), kind: 'motion-graphic', name: 'Six strips', code: POSTCARD_GRAPHIC_CODE,
    durationInFrames: f(PC.openerEnd), width: W, height: H,
    props: {
      sources: Object.fromEntries(cast.strips.map((c, i) => [`strip${i + 1}`, source(c, PC.openerEnd - PC.stripsAt[i]!, PC.stripsAt[i]!)])),
      windows: stripWindows(W, H, PC.stripsAt, PC.openerEnd), rsSection: 'opener',
    },
  });
  const openerFocus = focusForRange(cast.opener, openerMoment.inFrame, openerMoment.inFrame + f(PC.openerEnd));
  const closeUp = !!openerFocus && isCloseUp(openerFocus);
  if (params.person !== false && closeUp) warnings.push(`The opener (${cast.opener.name}) is a close-up, so nobody is cut out in front of the strips. A wide shot of you standing in the view works best.`);
  if (params.person !== false && cast.opener.kind === 'video' && !closeUp) {
    const cut = f(PC.flash[0]);
    const person = (id: string, from: number, to: number, white: number) => clipAt(id, L.person, cast.opener, from, to, openerMoment.inFrame + from, {
      name: white ? 'Person flashes white' : 'Person in front',
      effects: [{ id: `${id}-fx`, assetId: 'builtin:fx-person-cutout', overrides: { white } }],
      props: { rsSection: 'opener' },
    });
    person(stableId('rs-pc', tag, seed, 'person'), 0, cut, 0);
    person(stableId('rs-pc', tag, seed, 'flash'), cut, f(PC.flash[1]), 1);
  }
  const barsFrom = f(BAR_STEPS[0]![0]);
  const barKeys = (sign: 1 | -1): Keyframe[] => BAR_STEPS.map(([s, c]) => ({ frame: f(s) - barsFrom, value: sign * (100 - 100 * c) }));
  solid(stableId('rs-pc', tag, seed, 'bar-top'), L.barTop, 'Bar (top)', barsFrom, f(PC.openerEnd), { keyframes: { y: barKeys(-1) }, transform: { y: -100 } });
  solid(stableId('rs-pc', tag, seed, 'bar-bottom'), L.barBottom, 'Bar (bottom)', barsFrom, f(PC.openerEnd), { keyframes: { y: barKeys(1) }, transform: { y: 100 } });

  // Postcards: every clip in turn, each at a new moment, behind the opening band
  const cuts = postcardCuts(fps);
  const order = postcardOrder(clips, cuts.length, cast.finale.middle);
  const visits = new Map<string, number>();
  order.forEach((clip, i) => {
    const [a, b] = cuts[i]!;
    const k = visits.get(clip.assetId) ?? 0;
    visits.set(clip.assetId, k + 1);
    const room = Math.max(1, clip.durationInFrames - (b - a));
    const inFrame = clip.kind === 'video' ? ((clip.bestStartFrame ?? 0) + k * f(0.4)) % room : 0;
    clipAt(stableId('rs-pc', tag, seed, 'card', i), L.cards, clip, a, b, inFrame, { props: { rsSection: 'postcards' } });
  });
  const [p0, p1] = [f(PC.postcards[0]), f(PC.postcards[1])];
  const bandKeys = (sign: 1 | -1): Keyframe[] => [PC.postcards[0], PC.postcards[1]].map((s) => ({ frame: f(s) - p0, value: sign * (100 - 100 * bandCover(s)) }));
  solid(stableId('rs-pc', tag, seed, 'band-top'), L.bandTop, 'Band (top)', p0, p1, { keyframes: { y: bandKeys(-1) }, transform: { y: -100 } });
  solid(stableId('rs-pc', tag, seed, 'band-bottom'), L.bandBottom, 'Band (bottom)', p0, p1, { keyframes: { y: bandKeys(1) }, transform: { y: 100 } });

  // Finale
  const finaleSources = Object.fromEntries(FINALE_ROLES.map((role) => [role,
    source(cast.finale[role], FINALE_NEEDS_SEC[role], role.startsWith('grid') ? FINALE_GRID_FROM_SEC : 0)]));
  add(L.finale, f(PC.finaleAt), {
    id: stableId('rs-pc', tag, seed, 'finale'), kind: 'motion-graphic', name: 'Bands, cards, grid and panorama', code: POSTCARD_GRAPHIC_CODE,
    durationInFrames: end - f(PC.finaleAt), width: W, height: H,
    props: { sources: finaleSources, windows: finaleWindows(W, H, PC.finaleAt, bandCover), background: '#000000', rsSection: 'finale' },
  });

  // Title: the small words, the shuffling letters, the place
  const fade = f(PC.fadeSec);
  const text = (id: string, track: string, value: string, from: number, to: number, style: Record<string, unknown>, x: number, y: number, fades: boolean) =>
    add(track, from, {
      id, kind: 'text', name: value.slice(0, 24), durationInFrames: Math.max(1, to - from), width: W, height: H,
      props: { text: value, align: 'center', lineHeight: 1, rsFixedPosition: true, rsSection: 'title', ...style },
      transform: { x, y }, ...(fades ? { fadeOutFrames: fade } : {}),
    });
  const wordStyle = { fontFamily: 'Figtree', fontWeight: 300, fontSize: Math.round(H * 0.057), color: '#ffffff' };
  const left = (texts.wordLeft ?? '').replace(/[{}]/g, '').trim() || 'greetings';
  const right = (texts.wordRight ?? '').replace(/[{}]/g, '').trim() || 'from';
  if (left) text(stableId('rs-pc', tag, seed, 'word-l'), L.wordLeft, left, f(PC.wordsAt), end, wordStyle, -19, -6.6, true);
  if (right) text(stableId('rs-pc', tag, seed, 'word-r'), L.wordRight, right, f(PC.wordsAt), end, wordStyle, 21, -6.6, true);
  // Bebas capitals are about 0.42 em wide: shrink a long place to fit 57% of the width, never below 62%
  const big = Math.round(H * 0.226);
  const placeSize = Math.round(Math.max(big * 0.62, Math.min(big, (W * 0.57) / (Math.max(1, [...place].length) * 0.42))));
  if ((Math.max(1, [...place].length) * 0.42 * placeSize) > W * 0.6) warnings.push(`"${place}" is long for the title; it may run wide. Shorten it to the place's name.`);
  const placeStyle = { fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: placeSize, color: '#ff0000' };
  const s0 = f(PC.scramble[0]);
  scrambleStates(place, f(PC.scramble[1]) - s0, seed).forEach((state, k) =>
    text(stableId('rs-pc', tag, seed, 'shuffle', k), L.place, state, s0 + k, s0 + k + 1, placeStyle, 0, 6.9, false));
  text(stableId('rs-pc', tag, seed, 'place'), L.place, place, f(PC.placeAt), end, placeStyle, 0, 6.9, true);

  // Music: the user's song from its first downbeat, faded at the end
  const music = input.music;
  let startSec = 0;
  if (music) {
    startSec = musicStartSec(recipe, music, params);
    if (music.durationSec - startSec < PC.end - 0.05) warnings.push(`The song ends ${(PC.end - (music.durationSec - startSec)).toFixed(1)} s before the film.`);
    const musicFade = musicFadeFrames(recipe, fps, end, 'fadeOut');
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs-pc', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
        durationInFrames: end, srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? 0), ...(musicFade > 0 ? { fadeOutFrames: musicFade } : {}),
      } as never,
    });
  } else {
    warnings.push('No song: the film is silent. Add one to the Song input.');
  }

  const usedIds = [...new Set([cast.opener, ...cast.strips, ...Object.values(cast.finale), ...order].map((c) => c.assetId))];
  return {
    action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, run,
    report: { shots: 1 + 6 + cuts.length + 6, usedAssetIds: usedIds, musicStartSec: startSec, totalFrames: end, warnings },
  };
}
