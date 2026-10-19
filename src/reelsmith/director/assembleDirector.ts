// director@1 (RS-1201): compiles the agent's ReelPlan into one timeline batch. Sections run back to back on the song's
// beat clock (0.5 s a beat without a song). Each section's move builds its items on its own lanes: lane numbers restart
// per section, which is safe because sections never overlap in time. Overlay lines span several sections on lanes above.
import type { AtomicAction } from '../../editor/reducerActions';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import { RATIO_SIZES } from '../../../shared/reelsmith/ratios';
import type { PlanValue, ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { dbToGain, fpsOf } from '../assembler/common';
import { pickMoment } from '../assembler/travelDiary';
import { stableId } from '../assembler/rng';
import type { AssembleInput, AssembleResult, AssemblyClip, AssemblyMusic } from '../assembler/types';
import { moveById, textStyleById, type MoveDef, type MoveParam } from './moves';
import { isClipTextStyle } from './textStyles';
import { directorEffectById, directorTransitionById } from './catalog';
import { ALL_FX } from '../../gl/fx/effects';
import { RECIPE_TRANSITIONS } from '../assembler/transitions';
import { lookById, lookEffects } from '../looks';

/** Video lanes: V1 holds the black canvas, each section uses V2.. ; text lanes T1..T3 per section, T4.. for overlays. */
const SECTION_TEXT_LANES = 3;

/** The built-in recipe director runs go through (analysis, crop focus, track binding, one undo step). */
export function directorRecipe(plan: Pick<ReelPlan, 'ratio' | 'look'>): Recipe {
  const size = RATIO_SIZES[plan.ratio];
  return {
    schemaVersion: 1, id: 'director', version: '1.0.0', name: 'Director', category: 'other',
    description: 'A reel the agent directs from your story, media and song.',
    canvas: { width: size.width, height: size.height, fps: { num: 30, den: 1 } },
    inputs: [
      { id: 'clips', kind: 'media', accept: ['video', 'image'], min: 1, max: 200, label: 'Clips and photos' },
      { id: 'music', kind: 'media', accept: ['audio'], min: 0, max: 1, label: 'Song' },
    ],
    params: [],
    music: { inputId: 'music', required: false, startPolicy: 'firstDownbeat', endPolicy: 'fadeOut', fadeOutSec: 0.6, gainDb: 0, clipAudioGainDb: -96, duckUnderSpeech: false },
    assembler: { strategy: 'director@1', aiSelection: 'off' },
    structure: [],
    styles: {},
    ...(plan.look ? { look: { reelLook: plan.look } } : {}),
  } as Recipe;
}

/** Seconds from the reel start of fractional beat b; past the song's last beat the grid continues at its tempo. */
export function beatClock(music: AssemblyMusic | undefined, startSec: number): (b: number) => number {
  const rel = (music?.beatTimesSec ?? []).filter((t) => t >= startSec - 1e-3).map((t) => t - startSec);
  if (rel.length < 2) return (b) => b * 0.5;
  // the first beat may come a moment after the song starts: count from the reel start
  const grid = rel[0]! > 0.02 ? [0, ...rel] : rel;
  const period = (grid[grid.length - 1]! - grid[0]!) / (grid.length - 1);
  const at = (i: number) => (i < grid.length ? grid[i]! : grid[grid.length - 1]! + (i - grid.length + 1) * period);
  return (b) => { const i = Math.floor(b); return at(i) + (b - i) * (at(i + 1) - at(i)); };
}

function songStart(plan: ReelPlan, music: AssemblyMusic): number {
  if (typeof plan.musicStart === 'number') return Math.min(plan.musicStart, Math.max(0, music.durationSec - 1));
  if (plan.musicStart === 'fromStart') return 0;
  return music.beatTimesSec[music.downbeatIndex] ?? music.beatTimesSec[0] ?? 0;
}

/** Params with defaults filled and values checked against the move's (or text style's) declared params. */
export function resolveParams(defs: readonly MoveParam[], given: Record<string, PlanValue> | undefined, where: string, errors: string[]): Record<string, PlanValue> {
  const out: Record<string, PlanValue> = Object.fromEntries(defs.map((d) => [d.id, d.default]));
  for (const [k, v] of Object.entries(given ?? {})) {
    const d = defs.find((x) => x.id === k);
    if (!d) { errors.push(`${where}: unknown param "${k}" (allowed: ${defs.map((x) => x.id).join(', ') || 'none'})`); continue; }
    if (d.type === 'number' && (typeof v !== 'number' || (d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))) { errors.push(`${where}.${k} must be a number from ${d.min} to ${d.max}`); continue; }
    if (d.type === 'boolean' && typeof v !== 'boolean') { errors.push(`${where}.${k} must be true or false`); continue; }
    if (d.type === 'enum' && !d.options?.includes(String(v))) { errors.push(`${where}.${k} must be one of ${d.options?.join(', ')}`); continue; }
    if (d.type === 'color' && !(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) { errors.push(`${where}.${k} must be a colour like #ff0000`); continue; }
    if (d.type === 'text' && typeof v !== 'string') { errors.push(`${where}.${k} must be text`); continue; }
    out[k] = v;
  }
  return out;
}

export function assembleDirector(input: AssembleInput): AssembleResult {
  const { recipe, seed } = input;
  const plan = input.plan;
  const fps = fpsOf(recipe);
  const W = recipe.canvas.width;
  const H = recipe.canvas.height;
  const warnings: string[] = [];
  const run = { recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy, seed, params: input.params, texts: input.texts, assetIds: input.clips.map((c) => c.assetId).sort() };
  const fail = (msg: string): AssembleResult => ({ action: null, run, report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings: [...warnings, msg] } });
  if (!plan) return fail('director@1 needs a plan');

  // 1. moves, params, texts and lengths
  const errors: string[] = [];
  const music = input.music;
  const startSec = music ? songStart(plan, music) : 0;
  const clock = beatClock(music, startSec);
  const resolved = plan.sections.map((s, i) => {
    const where = `sections[${i}]`;
    const move = moveById(s.move);
    if (!move) { errors.push(`${where}: unknown move "${s.move}"`); return null; }
    const style = s.text ? textStyleById(s.textStyle ?? 'caption') : undefined;
    // section params feed the move and the section's text style; a key neither knows is a mistake
    const own = (defs: readonly MoveParam[]) => Object.fromEntries(Object.entries(s.params ?? {}).filter(([k]) => defs.some((d) => d.id === k)));
    for (const k of Object.keys(s.params ?? {})) {
      if (!move.params.some((d) => d.id === k) && !style?.params.some((d) => d.id === k)) errors.push(`${where}: unknown param "${k}" (${move.id} takes ${move.params.map((d) => d.id).join(', ') || 'none'}${style ? `; ${style.id} takes ${style.params.map((d) => d.id).join(', ') || 'none'}` : ''})`);
    }
    const params = resolveParams(move.params, own(move.params), where, errors);
    let beats = s.beats ?? move.beats.default;
    if (s.seconds !== undefined) beats = s.seconds / 0.5; // converted on the clock below
    if (s.beats !== undefined && (s.beats < move.beats.min || s.beats > move.beats.max)) {
      warnings.push(`${where} (${move.id}): ${s.beats} beats is outside ${move.beats.min}-${move.beats.max}; clamped.`);
      beats = Math.min(move.beats.max, Math.max(move.beats.min, s.beats));
    }
    if (s.text && !style) errors.push(`${where}: unknown textStyle "${s.textStyle}"`);
    if (s.transition && !directorTransitionById(s.transition)) errors.push(`${where}: unknown transition "${s.transition}"`);
    if (s.look && !lookById(s.look)) errors.push(`${where}: unknown look "${s.look}"`);
    for (const e of s.effects ?? []) {
      const known = directorEffectById(e.id);
      if (!known) { errors.push(`${where}: unknown effect "${e.id}"`); continue; }
      const def = ALL_FX[known.id]!;
      for (const [k, v] of Object.entries(e.params ?? {})) {
        const p = def.props.find((x) => x.key === k);
        if (!p) errors.push(`${where}: effect ${known.id} has no param "${k}" (it has ${def.props.map((x) => x.key).join(', ')})`);
        else if ('min' in p && typeof p.min === 'number' && typeof p.max === 'number' && (v < p.min || v > p.max)) errors.push(`${where}: ${known.id}.${k} must be ${p.min} to ${p.max}`);
      }
    }
    if (s.text && style && s.text.length > style.maxChars) errors.push(`${where}.text is longer than ${style.maxChars} characters for ${style.id}`);
    return { s, move, params, beats, style, textParams: style ? resolveParams(style.params, own(style.params), where, errors) : {} };
  });
  for (const o of plan.overlays ?? []) {
    const style = textStyleById(o.style);
    if (!style) errors.push(`overlay "${o.text}": unknown style "${o.style}"`);
    else if (o.text.length > style.maxChars) errors.push(`overlay "${o.text}" is longer than ${style.maxChars} characters for ${style.id}`);
  }
  if (errors.length) return fail(`The plan has problems: ${errors.join('; ')}`);

  // 2. the clock: section start and end frames
  const frame = (b: number) => Math.round(clock(b) * fps);
  let at = 0;
  const spans = resolved.map((r) => {
    const s = r!.s;
    const a = at;
    let b: number;
    if (s.seconds !== undefined) {
      // seconds: find the beat count whose clock length is closest, so the following sections stay on the beat grid
      const target = clock(at) + s.seconds;
      let nb = at;
      while (clock(nb + 0.25) <= target + 1e-6 && nb - at < 600) nb += 0.25;
      b = nb;
    } else b = at + r!.beats;
    at = b;
    return { b0: a, b1: b };
  });
  const total = frame(at);
  if (music && clock(at) > music.durationSec - startSec + 0.05) warnings.push(`The song ends ${(clock(at) - (music.durationSec - startSec)).toFixed(1)} s before the reel; shorten the plan or start the song earlier.`);

  // 3. clips: the plan's picks, else the best clips not used yet
  // "assetId@4.5" starts the clip at 4.5 s of the source (skipping a weak start)
  const byId = (ref: string): AssemblyClip | undefined => {
    const [id, at] = ref.split('@') as [string, string | undefined];
    const c = input.clips.find((x) => x.assetId === id) ?? input.clips.find((x) => x.baseAssetId === id);
    const sec = at === undefined ? NaN : Number(at);
    if (!c || !Number.isFinite(sec) || sec < 0 || c.kind !== 'video') return c;
    const f = Math.min(Math.round(sec * fps), Math.max(0, c.durationInFrames - 1));
    return { ...c, pinnedStartFrame: f, bestStartFrame: f };
  };
  const uses = new Map<string, number>();
  const used = new Map<string, Array<[number, number]>>();
  const tagScore = (c: AssemblyClip, wants: string[] = []) => (c.shot && wants.includes(c.shot.top) ? (wants.length - wants.indexOf(c.shot.top)) / wants.length : 0);
  const cast = (move: MoveDef, count: number, avoid: Set<string>): AssemblyClip[] => {
    const out: AssemblyClip[] = [];
    for (let i = 0; i < count; i += 1) {
      const pool = input.clips.filter((c) => !out.includes(c));
      const pick = [...(pool.length ? pool : input.clips)].sort((x, y) =>
        (uses.get(x.baseAssetId ?? x.assetId) ?? 0) - (uses.get(y.baseAssetId ?? y.assetId) ?? 0)
        || Number(avoid.has(x.assetId)) - Number(avoid.has(y.assetId))
        || tagScore(y, move.wants) - tagScore(x, move.wants) || y.score - x.score || x.assetId.localeCompare(y.assetId))[0];
      if (!pick) break;
      out.push(pick);
      uses.set(pick.baseAssetId ?? pick.assetId, (uses.get(pick.baseAssetId ?? pick.assetId) ?? 0) + 1);
    }
    return out;
  };

  const tag = `${recipe.id}@${recipe.version}`;
  const actions: AtomicAction[] = [];
  const usedIds = new Set<string>();
  let shotsCount = 0;
  actions.push({ type: 'add', startFrame: 0, item: { id: stableId('rs-dir', tag, seed, 'bg'), track: 'V1', kind: 'solid', name: 'Black canvas', durationInFrames: Math.max(1, total), width: W, height: H, props: { color: '#000000', rsSection: 'canvas' } } as never });
  let previous: { move: string; bandCover?: number } | undefined;
  // which actions each section emitted, for effects, looks, in-picture text and transitions
  const ranges: Array<[number, number]> = [];
  type Add = { type: 'add'; startFrame: number; item: { id: string; kind: string; track: string; durationInFrames: number; effects?: unknown; props?: Record<string, unknown> } };
  const isFootage = (a: AtomicAction): a is AtomicAction & Add => a.type === 'add' && (a.item.kind === 'video' || a.item.kind === 'image')
    && !((a.item.effects as Array<{ assetId: string }> | undefined) ?? []).some((e) => e.assetId === 'builtin:fx-person-cutout');
  const onClips = (section: number, baseOnly: boolean, f: (item: Add['item']) => Add['item']) => {
    const r = ranges[section];
    if (!r) return;
    for (let k = r[0]; k < r[1]; k += 1) {
      const a = actions[k]!;
      if (isFootage(a) && (!baseOnly || a.item.track === 'V2')) actions[k] = { ...a, item: f(a.item) } as AtomicAction;
    }
  };
  const bases = (section: number) => { const r = ranges[section]; return r ? actions.slice(r[0], r[1]).filter((a): a is AtomicAction & Add => isFootage(a) && a.item.track === 'V2').sort((x, y) => x.startFrame - y.startFrame) : []; };
  const firstBase = (section: number) => bases(section)[0];
  const lastBase = (section: number) => bases(section).at(-1);
  const clipText = (section: number, effect: { assetId: string; overrides: Record<string, number> }, text: string, fxId: string) => {
    let any = false;
    onClips(section, true, (item) => { any = true; return { ...item, props: { ...(item.props ?? {}), rsFxText: text }, effects: [...((item.effects as unknown[]) ?? []), { id: fxId, assetId: effect.assetId, overrides: { ...effect.overrides } }] }; });
    if (!any) warnings.push(`sections[${section}]: "${text}" needs full-frame footage under it (this move has none); not shown.`);
  };
  let lastClips = new Set<string>();
  resolved.forEach((r, i) => {
    const { s, move, params } = r!;
    const { b0, b1 } = spans[i]!;
    const start = frame(b0);
    const end = Math.max(start + 1, frame(b1));
    // clips
    let clips: AssemblyClip[] = [];
    if (s.clips?.length) {
      for (const id of s.clips) {
        const c = byId(id);
        if (c) { clips.push(c); uses.set(c.baseAssetId ?? c.assetId, (uses.get(c.baseAssetId ?? c.assetId) ?? 0) + 1); } else warnings.push(`sections[${i}]: unknown clip ${id}, left out`);
      }
    }
    const want = move.clips.max === 0 ? 0 : Math.min(move.clips.max, Math.max(move.clips.min, move.clipCount?.(b1 - b0, params, W, H) ?? move.clips.min));
    if (clips.length < Math.min(want, move.clips.min) || (!s.clips?.length && want > 0)) clips = [...clips, ...cast(move, Math.max(0, want - clips.length), lastClips)];
    if (move.clips.min > 0 && clips.length < move.clips.min) { warnings.push(`sections[${i}] (${move.id}) needs ${move.clips.min} clips; skipped.`); return; }
    clips.forEach((c) => usedIds.add(c.baseAssetId ?? c.assetId));
    shotsCount += clips.length;
    const id = (...parts: Array<string | number>) => stableId('rs-dir', tag, seed, i, ...parts);
    const firstAction = actions.length;
    move.build({
      W, H, fps, start, end, beats: b1 - b0, clips, params, seed: seed + i,
      beatFrame: (b) => Math.min(end, Math.max(start, frame(b0 + b))),
      id, layer: (n) => `V${2 + n}`,
      moment: (clip, frames) => {
        if (clip.kind === 'image') return { inFrame: 0, loop: false };
        if (clip.pinnedStartFrame !== undefined) {
          // a start too close to the end would leave the shot frozen for the rest of the section: start earlier so it keeps playing
          const room = Math.max(0, clip.durationInFrames - frames);
          if (clip.pinnedStartFrame > room && clip.durationInFrames >= frames) warnings.push(`sections[${i}]: "${clip.name}" starts ${(clip.pinnedStartFrame / fps).toFixed(1)} s but has only ${((clip.durationInFrames - clip.pinnedStartFrame) / fps).toFixed(1)} s left for a ${(frames / fps).toFixed(1)} s shot; started at ${(room / fps).toFixed(1)} s so it does not freeze.`);
          const inFrame = Math.min(clip.pinnedStartFrame, room);
          return { inFrame, loop: clip.durationInFrames - inFrame < frames };
        }
        const len = Math.max(1, Math.min(frames, clip.durationInFrames));
        const key = clip.baseAssetId ?? clip.assetId;
        const s0 = pickMoment(clip, len, used.get(key) ?? [], Math.round(fps * 0.5)) ?? 0;
        used.set(key, [...(used.get(key) ?? []), [s0, s0 + len]]);
        return { inFrame: s0, loop: clip.durationInFrames - s0 < frames };
      },
      emit: (a) => actions.push(a.type === 'add' ? { ...a, item: { ...a.item, props: { ...(a.item.props ?? {}), rsSection: `${i + 1}-${move.id}` } } } as AtomicAction : a),
      warn: (m) => warnings.push(`sections[${i}] (${move.id}): ${m}`),
      ...(previous ? { previous } : {}),
    });
    // the section's own line
    if (s.text && r!.style) {
      r!.style.build({
        W, H, fps, start, end, beats: b1 - b0, text: s.text, params: r!.textParams, seed: seed + i,
        beatFrame: (b) => Math.min(end, Math.max(start, frame(b0 + b))), id: (...p) => id('text', ...p), lane: (n) => `T${1 + n}`,
        emit: (a) => actions.push(a), warn: (m) => warnings.push(`sections[${i}] text: ${m}`),
      });
    }
    ranges[i] = [firstAction, actions.length];
    // section effects and look on its footage; a text style that lives in the picture rides on its main clips
    const fxList = [
      ...(s.effects ?? []).map((e, k) => ({ id: id('fx', k), assetId: directorEffectById(e.id)!.id, overrides: { ...(e.params ?? {}) } })),
      // look effect ids keep their look_ prefix so the Looks panel can replace them later
      ...(s.look ? lookEffects(lookById(s.look)!).map((e) => ({ ...e, id: `${e.id}_s${i}` })) : []),
    ];
    if (fxList.length) onClips(i, false, (item) => ({ ...item, effects: [...((item.effects as unknown[]) ?? []), ...fxList.map((e) => ({ ...e, overrides: { ...e.overrides } }))] }));
    if (s.text && r!.style && isClipTextStyle(r!.style)) clipText(i, r!.style.clipEffect({ W, H, fps, start, end, beats: b1 - b0, text: s.text, params: r!.textParams, seed: seed + i, beatFrame: frame, id, lane: () => 'T1', emit: () => {}, warn: () => {} }), s.text, id('textfx'));
    // the way in from the section before
    if (s.transition && i > 0) {
      const lastPrev = lastBase(i - 1);
      const firstHere = firstBase(i);
      const spec = RECIPE_TRANSITIONS[s.transition]!;
      if (lastPrev && firstHere && lastPrev.startFrame + lastPrev.item.durationInFrames === firstHere.startFrame) {
        const length = Math.max(2, Math.min(Math.round(spec.seconds * fps), Math.floor(Math.min(lastPrev.item.durationInFrames, firstHere.item.durationInFrames) / 2)));
        actions.push({ type: 'addTransition', id: id('tr-in'), incomingItemId: firstHere.item.id, transType: spec.type, durationInFrames: length } as AtomicAction);
      } else warnings.push(`sections[${i}]: the ${s.transition} transition needs footage on both sides of the cut (${previous?.move ?? 'none'} → ${move.id}); left as a cut.`);
    }
    previous = { move: move.id, ...(move.leaves?.({ params }) ?? {}) };
    lastClips = new Set(clips.map((c) => c.assetId));
  });

  // 4. overlays across sections
  (plan.overlays ?? []).forEach((o, k) => {
    const style = textStyleById(o.style)!;
    const a = frame(spans[o.from]!.b0);
    const b = frame(spans[o.to]!.b1);
    const params = resolveParams(style.params, o.params, `overlays[${k}]`, warnings);
    if (isClipTextStyle(style)) {
      for (let sct = o.from; sct <= o.to; sct += 1) clipText(sct, style.clipEffect({ W, H, fps, start: a, end: b, beats: 0, text: o.text, params, seed, beatFrame: frame, id: (...p) => stableId('rs-dir', tag, seed, 'overlay', k, ...p), lane: () => 'T1', emit: () => {}, warn: () => {} }), o.text, stableId('rs-dir', tag, seed, 'overlay', k, sct));
      return;
    }
    style.build({
      W, H, fps, start: a, end: b, beats: spans[o.to]!.b1 - spans[o.from]!.b0, text: o.text, params, seed: seed + 100 + k,
      beatFrame: (x) => Math.min(b, Math.max(a, frame(spans[o.from]!.b0 + x))), id: (...p) => stableId('rs-dir', tag, seed, 'overlay', k, ...p),
      lane: (n) => `T${1 + SECTION_TEXT_LANES * (k + 1) + n}`, emit: (x) => actions.push(x), warn: (m) => warnings.push(`overlays[${k}]: ${m}`),
    });
  });

  // 5. the song
  if (music) {
    const fade = Math.min(Math.round(0.6 * fps), Math.max(0, total - 1));
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs-dir', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src, durationInFrames: Math.max(1, total),
        srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId, volume: dbToGain(recipe.music?.gainDb ?? 0), ...(fade > 0 ? { fadeOutFrames: fade } : {}),
      } as never,
    });
  }
  const unusedClips = input.clips.filter((c) => !usedIds.has(c.baseAssetId ?? c.assetId)).length;
  if (unusedClips) warnings.push(`${unusedClips} clip${unusedClips === 1 ? ' was' : 's were'} not used.`);
  return {
    action: { type: 'batch', actions, label: 'Director: build reel' }, run,
    report: { shots: shotsCount, usedAssetIds: [...usedIds], musicStartSec: startSec, totalFrames: total, warnings },
  };
}
