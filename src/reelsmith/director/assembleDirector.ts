// director@1 (RS-1201): compiles the agent's ReelPlan into one timeline batch. Sections run back to back on the song's
// beat clock (0.5 s a beat without a song). Each section's move builds its items on its own lanes: lane numbers restart
// per section, which is safe because sections never overlap in time. Overlay lines span several sections on lanes above.
import type { AtomicAction } from '../../editor/reducerActions';
import type { Recipe } from '../../../shared/reelsmith/recipe';
import { RATIO_SIZES } from '../../../shared/reelsmith/ratios';
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { dbToGain, fpsOf } from '../assembler/common';
import { pickMoment } from '../assembler/moments';
import { stableId } from '../assembler/rng';
import type { AssembleInput, AssembleReport, AssembleResult, AssemblyClip, AssemblyMusic } from '../assembler/types';
import { textStyleById, type MoveDef } from './moves';
import { BAND_STYLE_ID, underBand } from './bandText';
import { isClipTextStyle } from './textStyles';
import { effectMixFor } from './effectTiming';
import { isSfxCue, sfxActions, TRANSITION_CUES, type SfxEvent } from './sfx';
import { serializableDefsFor } from '../../gl/fx/effects';
import { customTransitionUniforms, getCustomTransition } from '../../gl/customTransitions';
import { addRecipeTransition, RECIPE_TRANSITIONS } from '../assembler/transitions';
import { lookById, lookEffects } from '../looks';
import { focusForRange } from '../titleClear';
import { buildGraphics, coverFocus } from './graphics';
import { MOTION_RULES, applyMotionRules, toneParams } from './motionRules';
import { heardClip, songDuck, type NaturalWindow } from './naturalSound';
import { overSpeech, speechWindows, voiceFrames, voiceoverActions } from './voiceover';
import { lyricsCaptions, reelLyrics } from './lyrics';
import { traceShots } from './shotTrace';
import { FLASHING_MOVES, markBehind, outlineOnFlash, tagLine } from './lineMarks';
import { effectAsset, resolveParams, resolvePlanSections } from './planSections';

export { tagLine };
export { resolveParams, resolvePlanSections };

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

/** RS-1249: a section's footage at its own speed ("slow motion 50%"): video plays at speed x its rate; slowed sound is muted. */
export function withSpeed<T extends { kind?: string }>(item: T, speed: number | undefined): T {
  if (speed === undefined || speed === 1 || item.kind !== 'video') return item;
  const v = item as T & { playbackRate?: number; volume?: number };
  return { ...v, playbackRate: Math.round((v.playbackRate ?? 1) * speed * 1000) / 1000, ...(speed < 1 ? { volume: 0 } : {}) };
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
  const { sections: resolved, customFx } = resolvePlanSections(plan, warnings, errors);
  if (errors.length) return fail(`The plan has problems: ${errors.join('; ')}`);
  const rule = plan.tone ? MOTION_RULES[plan.tone] : undefined;

  // 2. the clock: section start and end frames
  const frame = (b: number) => Math.round(clock(b) * fps);
  let at = 0;
  // RS-1251: where the plan meant this section to end, in seconds from the reel start. Each seconds-section snaps that
  // running total to the grid (nearest quarter beat), so rounding never adds up: flooring each length on its own put
  // the voiceover reel's cuts 0.5 s ahead of their lines by the end.
  let meant = 0;
  const spans = resolved.map((r) => {
    const s = r!.s;
    const a = at;
    let b: number;
    if (s.seconds !== undefined) {
      meant += s.seconds;
      let nb = at + 0.25;
      while (clock(nb + 0.25) <= meant + 1e-6 && nb - at < 600) nb += 0.25;
      if (Math.abs(clock(nb + 0.25) - meant) < Math.abs(clock(nb) - meant)) nb += 0.25;
      b = nb;
    } else { b = at + r!.beats; meant = clock(b); }
    at = b;
    return { b0: a, b1: b };
  });
  const total = frame(at);
  // RS-1251: the user's narration plays whole; a reel shorter than it would cut their last words off
  const voice = input.voiceover;
  const voiceStart = voice ? Math.min(plan.voiceoverStart ?? 0, Math.max(0, voice.durationSec - 0.5)) : 0;
  const voiceLen = voice ? voiceFrames(voice, voiceStart, fps) : 0;
  if (voice && total < voiceLen - Math.round(0.1 * fps)) {
    const short = (voiceLen - total) / fps;
    return fail(`The reel is ${(total / fps).toFixed(1)} s but the voiceover runs ${(voiceLen / fps).toFixed(1)} s: the sections must add up to at least ${(voiceLen / fps).toFixed(1)} s (add ${short.toFixed(1)} s, e.g. hold the last shot or the end card longer). The voiceover is never cut.`);
  }
  const speech = voice ? speechWindows(voice, voiceStart, fps, total) : [];
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
  const onClips = (section: number, baseOnly: boolean, f: (item: Add['item'], startFrame: number) => Add['item']) => {
    const r = ranges[section];
    if (!r) return;
    for (let k = r[0]; k < r[1]; k += 1) {
      const a = actions[k]!;
      if (isFootage(a) && (!baseOnly || a.item.track === 'V2')) actions[k] = { ...a, item: f(a.item, a.startFrame) } as AtomicAction;
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
  const sfx: SfxEvent[] = [];
  const sectionClips: string[][] = [];
  const sectionMoments: number[][] = [];
  const momentUse: NonNullable<AssembleReport['momentUse']> = [];
  resolved.forEach((r, i) => {
    const { s, move } = r!;
    // RS-1249: a shot list moves only as the user asked
    const { b0, b1 } = spans[i]!;
    // RS-1249: a shot list moves only as the user asked, and a listed shot is one shot: a cut's time is shared by the
    // clips it names (a 3 s shot of one clip, not three 1 s cuts of the default grid)
    const params = plan.shotList
      ? (move.id === 'cut' && s.params?.every === undefined && s.clips?.length ? { ...r!.params, every: (b1 - b0) / s.clips.length } : r!.params)
      : toneParams(rule, move.id, s.params, r!.params);
    const start = frame(b0);
    const end = Math.max(start + 1, frame(b1));
    // clips
    let clips: AssemblyClip[] = [];
    // a section kept by a fix comes back with the clips it was cast last time
    const kept = plan.keep?.[i] ?? undefined;
    const picks = kept ? kept.clips : s.clips;
    if (picks?.length) {
      for (const id of picks) {
        const c = byId(id);
        if (c) { clips.push(c); uses.set(c.baseAssetId ?? c.assetId, (uses.get(c.baseAssetId ?? c.assetId) ?? 0) + 1); } else warnings.push(`sections[${i}]: unknown clip ${id}, left out`);
      }
    }
    const want = move.clips.max === 0 ? 0 : Math.min(move.clips.max, Math.max(move.clips.min, move.clipCount?.(b1 - b0, params, W, H) ?? move.clips.min));
    if (clips.length < Math.min(want, move.clips.min) || (!picks?.length && want > 0)) clips = [...clips, ...cast(move, Math.max(0, want - clips.length), lastClips)];
    if (move.clips.min > 0 && clips.length < move.clips.min) { warnings.push(`sections[${i}] (${move.id}) needs ${move.clips.min} clips; skipped.`); return; }
    clips.forEach((c) => usedIds.add(c.baseAssetId ?? c.assetId));
    shotsCount += clips.length;
    const id = (...parts: Array<string | number>) => stableId('rs-dir', tag, seed, i, ...parts);
    const firstAction = actions.length;
    // every shot's source frame in order, so a fix can replay this section exactly (RS-1216)
    const moments: number[] = [];
    const momentOf = (clip: AssemblyClip, frames: number): { inFrame: number; loop: boolean } => {
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
    };
    move.build({
      W, H, fps, start, end, beats: b1 - b0, clips, params, seed: seed + i, clipVolume: music || voice ? 0 : 1,
      beatFrame: (b) => Math.min(end, Math.max(start, frame(b0 + b))),
      id, layer: (n) => `V${2 + n}`,
      moment: (clip, frames) => {
        const again = kept?.moments[moments.length];
        let m: { inFrame: number; loop: boolean };
        if (again !== undefined && clip.kind !== 'image') {
          const key = clip.baseAssetId ?? clip.assetId;
          used.set(key, [...(used.get(key) ?? []), [again, again + frames]]);
          m = { inFrame: again, loop: clip.durationInFrames - again < frames };
        } else m = momentOf(clip, frames);
        moments.push(m.inFrame);
        momentUse.push({ section: i, assetId: clip.baseAssetId ?? clip.assetId, inFrame: m.inFrame, frames });
        return m;
      },
      emit: (a) => actions.push(a.type === 'add' ? { ...a, item: withSpeed({ ...a.item, props: { ...(a.item.props ?? {}), rsSection: `${i + 1}-${move.id}` } }, s.speed) } as AtomicAction : a),
      warn: (m) => warnings.push(`sections[${i}] (${move.id}): ${m}`),
      ...(previous ? { previous } : {}),
    });
    // the section's own line
    if (s.text && r!.style) {
      r!.style.build({
        W, H, fps, start, end, beats: b1 - b0, text: s.text, params: r!.textParams, seed: seed + i,
        beatFrame: (b) => Math.min(end, Math.max(start, frame(b0 + b))), id: (...p) => id('text', ...p), lane: (n) => `T${1 + n}`,
        emit: (a) => {
          const flashes = FLASHING_MOVES.has(move.id) && s.params?.flash !== false;
          actions.push(tagLine(s.textBehind ? markBehind(a) : flashes ? outlineOnFlash(a) : a, `s${i + 1}`, s.text!, r!.style!.id));
        },
        warn: (m) => warnings.push(`sections[${i}] text: ${m}`),
      });
    }
    ranges[i] = [firstAction, actions.length];
    // section effects and look on its footage; a text style that lives in the picture rides on its main clips
    // each section effect carries its own envelope per clip (strength, region, timing on the beat)
    const sectionClock = { fps, start, end, beats: b1 - b0, beatAt: (b: number) => frame(b0 + b) };
    const lookList = s.look ? lookEffects(lookById(s.look)!).map((e) => ({ ...e, id: `${e.id}_s${i}` })) : [];
    if (s.effects?.length || lookList.length) onClips(i, false, (item, at) => ({ ...item, effects: [
      ...((item.effects as unknown[]) ?? []),
      ...(s.effects ?? []).map((e, k) => {
        const mix = effectMixFor(e, sectionClock, at, item.durationInFrames);
        return { id: id('fx', k), assetId: effectAsset(e.id)!, overrides: { ...(e.params ?? {}) }, ...(mix ? { mix } : {}) };
      }),
      // look effect ids keep their look_ prefix so the Looks panel can replace them later
      ...lookList.map((e) => ({ ...e, overrides: { ...e.overrides } })),
    ] }));
    if (s.text && r!.style && isClipTextStyle(r!.style)) clipText(i, r!.style.clipEffect({ W, H, fps, start, end, beats: b1 - b0, text: s.text, params: r!.textParams, seed: seed + i, beatFrame: frame, id, lane: () => 'T1', emit: () => {}, warn: () => {} }), s.text, id('textfx'));
    // the way in from the section before
    if (s.transition && i > 0) {
      const lastPrev = lastBase(i - 1);
      const firstHere = firstBase(i);
      const custom = getCustomTransition(s.transition);
      const spec = RECIPE_TRANSITIONS[s.transition] ?? { type: 'custom-shader' as const, seconds: 0.5 };
      if (lastPrev && firstHere && lastPrev.startFrame + lastPrev.item.durationInFrames === firstHere.startFrame) {
        const length = Math.max(2, Math.min(Math.round(spec.seconds * (rule?.transition ?? 1) * fps), Math.floor(Math.min(lastPrev.item.durationInFrames, firstHere.item.durationInFrames) / 2)));
        actions.push(...addRecipeTransition(spec, {
          type: 'addTransition', id: id('tr-in'), incomingItemId: firstHere.item.id, transType: spec.type, durationInFrames: length,
          ...(custom ? { custom: { frag: custom.frag, uniforms: customTransitionUniforms(custom), label: custom.label } } : {}),
        } as Extract<AtomicAction, { type: 'addTransition' }>));
        const cue = custom ? 'whoosh-soft' : TRANSITION_CUES[s.transition];
        if (cue) sfx.push({ frame: firstHere.startFrame, cue });
      } else warnings.push(`sections[${i}]: the ${s.transition} transition needs footage on both sides of the cut (${previous?.move ?? 'none'} → ${move.id}); left as a cut.`);
    }
    // the moments that want a sound: cuts inside fast moves, a punch on the drop, a build into the next section
    const cuts = bases(i).map((a) => a.startFrame).filter((f) => f > start);
    if (move.id === 'flash-cuts' || move.id === 'break-in') cuts.forEach((f) => sfx.push({ frame: f, cue: 'shutter' }));
    if (move.id === 'photo-stack') { const r0 = ranges[i]!; actions.slice(r0[0], r0[1]).filter(isFootage).forEach((a) => sfx.push({ frame: a.startFrame, cue: 'shutter' })); }
    if (move.id === 'speed-ramp' && cuts.length >= 2) sfx.push({ frame: cuts[0]!, cue: 'whoosh-heavy' }, { frame: cuts[1]!, cue: 'whoosh-soft' });
    if (move.id === 'zoom-punch' || s.textStyle === 'slam' || (s.effects ?? []).some((e) => e.timing === 'drop')) sfx.push({ frame: start, cue: 'hit' });
    if ((s.effects ?? []).some((e) => e.timing === 'build') && i < resolved.length - 1) sfx.push({ frame: end, cue: 'riser' });
    // moves mark their own sound moments (a velocity slam, a freeze, a 3D zoom...) with props.rsAccent
    { const r0 = ranges[i]!; for (const a of actions.slice(r0[0], r0[1])) { if (a.type !== 'add') continue; const accent = (a.item.props as { rsAccent?: unknown } | undefined)?.rsAccent; if (typeof accent === 'string' && isSfxCue(accent)) sfx.push({ frame: a.startFrame ?? 0, cue: accent }); } }
    for (const snd of s.sounds ?? []) sfx.push({ frame: frame(b0 + (snd.beat ?? 0)), cue: 'hit', soundId: snd.id });
    previous = { move: move.id, ...(move.leaves?.({ params }) ?? {}) };
    lastClips = new Set(clips.map((c) => c.assetId));
    sectionClips[i] = clips.map((c) => c.assetId);
    sectionMoments[i] = moments;
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
    if (style.id === BAND_STYLE_ID) {
      for (let sct = o.from; sct <= o.to; sct += 1) {
        onClips(sct, false, (item) => underBand(item as never, W, H) as never);
        const r = ranges[sct];
        if (r && actions.slice(r[0], r[1]).some((x) => x.type === 'add' && (x as Add).item.kind === 'motion-graphic')) warnings.push(`sections[${sct}] (${resolved[sct]?.move.id}): this move draws full-frame graphics that cover the title band; use cut, hold or flash-cuts under a band.`);
      }
    }
    style.build({
      W, H, fps, start: a, end: b, beats: spans[o.to]!.b1 - spans[o.from]!.b0, text: o.text, params, seed: seed + 100 + k,
      beatFrame: (x) => Math.min(b, Math.max(a, frame(spans[o.from]!.b0 + x))), id: (...p) => stableId('rs-dir', tag, seed, 'overlay', k, ...p),
      lane: (n) => `T${1 + SECTION_TEXT_LANES * (k + 1) + n}`, emit: (x) => actions.push(tagLine(o.behind ? markBehind(x) : x, `o${k + 1}`, o.text, style.id)), warn: (m) => warnings.push(`overlays[${k}]: ${m}`),
    });
  });

  // 4b. drawn graphics over the reel (RS-1213), on lanes above every line, with their own sounds
  buildGraphics(plan.graphics ?? [], {
    W, H, fps, clock, sectionBeats: spans, resolveParams, id: (...p) => stableId('rs-dir', tag, seed, ...p), emit: (a) => actions.push(a),
    sound: (f, cue) => sfx.push({ frame: f, cue }), warn: (m) => warnings.push(m),
    focusAt: (section, f) => {
      const base = bases(section).filter((a) => a.startFrame <= f).at(-1) ?? firstBase(section);
      const c = base && input.clips.find((x) => x.assetId === (base.item as { sourceAssetId?: string }).sourceAssetId);
      if (!base || !c?.width || !c.height) return undefined;
      const src = ((base.item as { srcInFrame?: number }).srcInFrame ?? 0) + Math.max(0, f - base.startFrame);
      const rect = focusForRange(c, src, src + fps);
      return rect ? coverFocus(rect, { width: c.width, height: c.height }, W, H) : undefined;
    },
    shotAt: (section, f) => {
      const base = bases(section).filter((a) => a.startFrame <= f).at(-1) ?? firstBase(section);
      const c = base && input.clips.find((x) => x.assetId === (base.item as { sourceAssetId?: string }).sourceAssetId);
      if (!base || !c?.width || !c.height || !c.src) return undefined;
      const src = ((base.item as { srcInFrame?: number }).srcInFrame ?? 0) + Math.max(0, f - base.startFrame);
      return { src: c.src, kind: c.kind === 'image' ? 'image' : 'video', sec: c.kind === 'image' ? 0 : src / fps, width: c.width, height: c.height };
    },
  });

  // lines behind the person: a cut-out copy of each shot under the line goes on a lane above every text lane
  const behind = [
    ...plan.sections.flatMap((x, i) => (x.textBehind && x.text ? [{ from: i, to: i, what: `sections[${i}]`, style: resolved[i]?.style }] : [])),
    ...(plan.overlays ?? []).flatMap((o, k) => (o.behind ? [{ from: o.from, to: o.to, what: `overlays[${k}]`, style: textStyleById(o.style) }] : [])),
  ];
  const cutouts = new Set<string>();
  for (const b of behind) {
    if (b.style && isClipTextStyle(b.style)) { warnings.push(`${b.what}: ${b.style.id} is already drawn in the picture; behind is ignored.`); continue; }
    let any = false;
    for (let sct = b.from; sct <= b.to; sct += 1) {
      for (const base of bases(sct)) {
        if (base.item.kind !== 'video' || cutouts.has(base.item.id)) continue;
        cutouts.add(base.item.id);
        any = true;
        const c = input.clips.find((x) => x.assetId === (base.item as { sourceAssetId?: string }).sourceAssetId);
        if (c?.shot && !['people', 'posing', 'portrait', 'action'].includes(c.shot.top)) warnings.push(`${b.what}: "${c.name}" may have nobody in it; the line stays in front there.`);
        const tr = actions.find((a) => a.type === 'addTransition' && (a as { incomingItemId: string }).incomingItemId === base.item.id) as { durationInFrames?: number } | undefined;
        actions.push({
          type: 'add', startFrame: base.startFrame,
          item: {
            ...base.item, id: `${base.item.id}-front`, track: 'P1', name: `${base.item.name} (in front of the line)`,
            // the same effects as the shot; the cut-out itself is added last, after shot matching (withFrontCutouts)
            ...(base.item.effects ? { effects: (base.item.effects as Array<{ id: string }>).map((e) => ({ ...e, id: `${e.id}-front` })) } : {}),
            ...(tr?.durationInFrames ? { fadeInFrames: tr.durationInFrames } : {}),
            props: { ...(base.item.props ?? {}), rsFront: true },
          },
        } as AtomicAction);
      }
    }
    if (!any) warnings.push(`${b.what}: behind needs video footage with a person under the line; left in front.`);
  }

  // custom effects live in this session's registry: snapshot their shaders into the project (state.fxDefs) through one
  // clip that uses each, so they survive a reload and render in export
  for (const fxId of customFx) {
    const user = actions.find((a): a is AtomicAction & Add => a.type === 'add' && ((a.item.effects as Array<{ assetId: string }> | undefined) ?? []).some((e) => e.assetId === fxId));
    if (user) actions.push({ type: 'setEffects', id: user.item.id, effects: user.item.effects, defs: serializableDefsFor([{ assetId: fxId }]) } as AtomicAction);
  }

  // 4c. RS-1225: sections where the clips' own sound plays (a shout at the top, a splash, someone talking): their base
  // clips get their sound back with a short ramp so nothing clicks, and the song dips under them below
  const natural: NaturalWindow[] = [];
  if (music || voice) resolved.forEach((r, i) => {
    const mode = r!.s.naturalSound ?? (r!.move.id === 'talk-zoom' ? 'under' : undefined);
    if (!mode || !ranges[i]) return;
    // RS-1251: nothing talks over the user's narration
    if (voice && overSpeech(frame(spans[i]!.b0), frame(spans[i]!.b1), speech)) {
      if (r!.s.naturalSound) warnings.push(`sections[${i}] (${r!.move.id}): naturalSound left off: the voiceover is speaking there (the clips' sound may only play in its pauses).`);
      return;
    }
    natural.push({ from: frame(spans[i]!.b0), to: Math.max(frame(spans[i]!.b0) + 1, frame(spans[i]!.b1)), solo: mode === 'solo' });
    let any = false;
    onClips(i, true, (item) => {
      if (item.kind !== 'video' || item.props?.rsRewind) return item;
      any = true;
      return heardClip(item);
    });
    if (!any) warnings.push(`sections[${i}] (${r!.move.id}): naturalSound needs video footage; its photos have no sound.`);
  });

  // 5. sound effects under the song (hand-placed ones always; the rest unless the plan turns them off)
  const level = plan.sfx ?? (voice ? 'subtle' : 'auto');
  actions.push(...sfxActions(level === 'off' ? sfx.filter((e) => e.soundId) : sfx, { fps, total, level: level === 'off' ? 'auto' : level, id: (...p) => stableId('rs-dir', tag, seed, ...p) }));

  // RS-1253: the sung words, when the plan asks for lyrics and the song has some
  const lyricWords = plan.lyrics && music ? reelLyrics(music.lyrics ?? [], startSec, (total / fps) * 1000) : [];
  if (plan.lyrics && music && !lyricWords.length) warnings.push('lyrics: the song has no words to show (it was not transcribed, or nothing sung was heard); the reel has no lyrics.');
  // 6. the song
  if (music) {
    // RS-1226: a loop replays from the first beat, so the song runs to the last frame instead of fading
    const fade = plan.loop ? 0 : Math.min(Math.round(0.6 * fps), Math.max(0, total - 1));
    const gain = dbToGain(recipe.music?.gainDb ?? 0);
    const duck = songDuck([...natural, ...speech], gain, total, fps);
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs-dir', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src, durationInFrames: Math.max(1, total),
        srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId, volume: gain, ...(fade > 0 ? { fadeOutFrames: fade } : {}),
        ...(duck.length ? { keyframes: { volume: duck } } : {}),
      } as never,
    });
    if (lyricWords.length) actions.push(lyricsCaptions(lyricWords, { style: plan.lyrics!.style, color: plan.lyrics!.color }));
  }
  // RS-1251: the narration, whole, with its words as captions (a lyric reel's captions are the lyrics)
  if (voice) actions.push(...voiceoverActions(voice, { startSec: voiceStart, fps, total, id: stableId('rs-dir', tag, seed, 'voiceover'), captions: lyricWords.length ? false : plan.captions }));
  // RS-1217: how long each shot runs, for the pace check against a reference. A cut is a new shot on the base lane (V2);
  // a velocity or speed ramp splits one shot into rate segments that carry on in the same clip, which is not a cut.
  const base = actions.filter((a): a is AtomicAction & Add => isFootage(a) && a.item.track === 'V2' && !a.item.props?.rsFront).sort((x, y) => x.startFrame - y.startFrame);
  const cuts: number[] = [];
  base.forEach((a, k) => {
    const prev = base[k - 1]?.item as { sourceAssetId?: string; srcInFrame?: number; durationInFrames: number; playbackRate?: number } | undefined;
    const item = a.item as { sourceAssetId?: string; srcInFrame?: number };
    const carriesOn = prev && base[k - 1]!.startFrame + prev.durationInFrames === a.startFrame && prev.sourceAssetId === item.sourceAssetId
      && Math.abs((prev.srcInFrame ?? 0) + prev.durationInFrames * (prev.playbackRate ?? 1) - (item.srcInFrame ?? 0)) < fps * 0.5;
    if (!carriesOn && cuts.at(-1) !== a.startFrame) cuts.push(a.startFrame);
  });
  const shotSec = cuts.map((f, k) => ((cuts[k + 1] ?? total) - f) / fps).filter((x) => x > 0);
  // RS-1228/1225: how far the subject jumps at fast cuts, and voices muted under the song, for the review
  const { eyeJumps, voices } = traceShots(base, cuts, input.clips, { fps, W, H, music: !!music || !!voice });
  const unusedClips = input.clips.filter((c) => !usedIds.has(c.baseAssetId ?? c.assetId)).length;
  if (unusedClips) warnings.push(`${unusedClips} clip${unusedClips === 1 ? ' was' : 's were'} not used.`);
  return {
    action: { type: 'batch', actions: plan.tone ? applyMotionRules(actions, plan.tone, fps) : actions, label: 'Director: build reel' }, run,
    report: { shots: shotsCount, usedAssetIds: [...usedIds], musicStartSec: startSec, totalFrames: total, warnings, sectionClips: Array.from({ length: resolved.length }, (_, k) => sectionClips[k] ?? []), sectionMoments: Array.from({ length: resolved.length }, (_, k) => sectionMoments[k] ?? []), momentUse, shotSec, ...(eyeJumps.length ? { eyeJumps } : {}), ...(voices.length ? { voices } : {}) },
  };
}
