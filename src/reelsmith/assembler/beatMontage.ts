// beat-montage@1: cuts on beats/bars of the music, clips chosen by score and never repeated.
import type { Recipe, RecipeSection } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import { renderTemplate } from '../../../shared/reelsmith/recipe';
import { sourcePlacement } from './sourcePlacement';
import { fitFontSize } from './common';
import { makeRng, stableId } from './rng';
import { applyCastingBias, castSlots, planToOrder } from './casting';
import { pickTransitions, transitionActions } from './transitions';
import { fitToBars, musicStart } from '../beatGrid';
import { MUSIC_PARAM, musicFadeFrames } from '../musicPolicy';
import type {
  AssembleInput, AssembleReport, AssembleResult, AssemblyClip, AssemblyMusic, PlannedShot, RecipeRunRecord,
} from './types';

const STEP_BEATS: Record<string, (beatsPerBar: number) => number> = {
  everyBeat: () => 1,
  every2Beats: () => 2,
  everyBar: (bpb) => bpb,
};

function fpsOf(recipe: Recipe): number {
  return recipe.canvas.fps.num / recipe.canvas.fps.den;
}

export function musicStartSec(recipe: Recipe, music: AssemblyMusic, params: AssembleInput['params']): number {
  const policy = recipe.music?.startPolicy ?? 'fromStart';
  const downbeat = music.beatTimesSec[music.downbeatIndex] ?? music.beatTimesSec[0] ?? 0;
  if (policy === 'firstDownbeat') return downbeat;
  // RS-203: a build+drop recipe with a known drop starts one build-length before it, so the build is actually heard
  const build = recipe.structure.find((x) => x.section === 'build');
  const dropAt = Number(params.dropAtS ?? 0) > 0 ? Number(params.dropAtS) : music.dropSec;
  if (policy === 'loudestSection' && build?.lengthBeats && dropAt !== undefined && recipe.structure.some((x) => x.section === 'drop')) {
    const times = music.beatTimesSec;
    const dropIdx = times.reduce((best, b, i) => (Math.abs(b - dropAt) < Math.abs(times[best]! - dropAt) ? i : best), 0);
    return times[Math.max(0, dropIdx - build.lengthBeats)] ?? 0;
  }
  // RS-602: loudest section and a chosen time both snap to the nearest downbeat, so the reel starts on a bar
  if (policy === 'loudestSection') return musicStart('loudestSection', music, { loudestSec: music.loudestStartSec ?? downbeat });
  if (policy === 'userOffset') return musicStart('userOffset', music, { offsetSec: Number(params[MUSIC_PARAM.offsetSec] ?? 0) || 0 });
  return 0;
}

/** Beat times (relative to reel start) available from `startSec`, always including beat 0 at the reel start. */
function beatsFrom(music: AssemblyMusic, startSec: number): number[] {
  const eps = 1e-3;
  const rel = music.beatTimesSec.filter((b) => b >= startSec - eps).map((b) => Math.max(0, b - startSec));
  if (!rel.length || rel[0]! > eps) rel.unshift(0);
  else rel[0] = 0;
  return rel;
}

function targetBeatCount(recipe: Recipe, music: AssemblyMusic, startSec: number, beats: number[], params: AssembleInput['params']): number {
  const beatsPerBar = music.beatsPerBar;
  const d = recipe.duration ?? {};
  const maxSec = d.maxSec ?? d.targetSec ?? Infinity;
  const wantSec = Math.min(d.targetSec ?? maxSec, maxSec);
  let n = beats.findIndex((t) => t >= wantSec);
  if (n < 0) n = beats.length - 1;
  // RS-602: "fit reel length to whole bars" takes the bar nearest the target within [minSec, maxSec];
  // "end on a bar" takes the last full bar at or before it. Bars are the song's own, counted from its downbeat.
  const fit = params[MUSIC_PARAM.fitBars] === true;
  if (fit || (recipe.music?.endPolicy ?? 'hardCut') === 'endOnBar') {
    const lastSec = beats[beats.length - 1] ?? 0;
    const endRel = fit
      ? fitToBars(music, startSec, wantSec, 'nearest', { minSec: d.minSec ?? 0, maxSec: Math.min(maxSec, lastSec) })
      : fitToBars(music, startSec, wantSec, 'down', { maxSec: lastSec });
    const k = beats.findIndex((t) => Math.abs(t - endRel) < 1e-3);
    if (k > 0) n = k;
  }
  return Math.max(beatsPerBar, n);
}

/** Split `totalBeats` across sections (fixed lengthBeats first, flexible ones share the rest). */
function sectionBeats(sections: RecipeSection[], totalBeats: number): number[] {
  const fixed = sections.reduce((s, x) => s + (x.lengthBeats ?? 0), 0);
  const flexible = sections.filter((x) => x.lengthBeats === undefined);
  const rest = Math.max(0, totalBeats - fixed);
  const per = flexible.length ? Math.floor(rest / flexible.length) : 0;
  let extra = flexible.length ? rest - per * flexible.length : 0;
  return sections.map((x) => {
    if (x.lengthBeats !== undefined) return x.lengthBeats;
    const give = per + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return give;
  });
}

export interface SectionSpan { section: string; startBeat: number; lengthBeats: number; startFrame: number; endFrame: number }

export function planShots(
  recipe: Recipe, music: AssemblyMusic, params: AssembleInput['params'], stretch: number,
): { shots: PlannedShot[]; totalBeats: number; startSec: number; spans: SectionSpan[] } {
  const fps = fpsOf(recipe);
  const startSec = musicStartSec(recipe, music, params);
  const beats = beatsFrom(music, startSec);
  const bpb = music.beatsPerBar;
  const totalBeats = Math.min(targetBeatCount(recipe, music, startSec, beats, params), beats.length - 1);
  // RS-412: a `strobe` section is a flash-cut hook: its length and cut step follow the params hookSec (1.5) and flashSec (0.5, kept
  // within 0.3-0.6 s), in whole beats.
  const beatSec = beats.length > 1 ? (beats[beats.length - 1]! - beats[0]!) / (beats.length - 1) : 0.5;
  const flashSec = Math.min(0.6, Math.max(0.3, Number(params.flashSec ?? 0.5) || 0.5));
  const hookSec = Math.max(flashSec, Number(params.hookSec ?? 1.5) || 1.5);
  const strobeStep = Math.max(1, Math.round(flashSec / beatSec));
  const strobeBeats = strobeStep * Math.max(1, Math.round(hookSec / (strobeStep * beatSec)));
  const structure = recipe.structure.map((x) => (x.strobe ? { ...x, lengthBeats: strobeBeats } : x));
  const lens = sectionBeats(structure, totalBeats);
  // RS-203: when a drop is known, the 'build' section runs up to the drop (whole bars) and 'drop' takes the rest
  const dropAt = Number(params.dropAtS ?? 0) > 0 ? Number(params.dropAtS) : music.dropSec;
  const bi = recipe.structure.findIndex((x) => x.section === 'build');
  const di = recipe.structure.findIndex((x) => x.section === 'drop');
  if (dropAt !== undefined && bi >= 0 && di >= 0) {
    const rel = dropAt - startSec;
    let k = beats.findIndex((t) => t >= rel - 1e-3);
    if (k > 0) {
      k = Math.round(k / bpb) * bpb;
      // sections after the drop (an end card) keep their own length; the drop takes what is left
      const others = lens.reduce((sum, n, i) => (i === bi || i === di ? sum : sum + n), 0);
      if (k >= bpb && k <= totalBeats - others - bpb) { lens[bi] = k; lens[di] = totalBeats - others - k; }
    }
  }
  const paramRule = typeof params.cutRule === 'string' ? params.cutRule : undefined;
  const shots: PlannedShot[] = [];
  const spans: SectionSpan[] = [];
  const frameAt = (beat: number) => Math.round((beats[Math.min(beat, beats.length - 1)] ?? 0) * fps);
  let cursor = 0;
  structure.forEach((section, si) => {
    const len = Math.min(lens[si]!, totalBeats - cursor);
    if (len > 0) spans.push({ section: section.section, startBeat: cursor, lengthBeats: len, startFrame: frameAt(cursor), endFrame: frameAt(cursor + len) });
    if (len <= 0 || section.fill === 'none') { cursor += Math.max(0, len); return; }
    // a `cutRule` param drives the flexible (no lengthBeats) sections
    const rule = section.lengthBeats === undefined && paramRule ? paramRule : section.cutRule ?? 'everyBar';
    let step = section.strobe ? strobeStep : (STEP_BEATS[rule] ?? STEP_BEATS.everyBar!)(bpb);
    if (section.lengthBeats === undefined) step *= stretch;
    for (let b = 0; b < len; b += step) {
      const lengthBeats = Math.min(step, len - b);
      const a = cursor + b;
      const startFrame = Math.round(beats[a]! * fps);
      const endFrame = Math.round((beats[Math.min(a + lengthBeats, beats.length - 1)] ?? beats[beats.length - 1]!) * fps);
      if (endFrame > startFrame) {
        shots.push({
          section: section.section, startBeat: a, lengthBeats, startFrame,
          durationInFrames: endFrame - startFrame, transition: section.transition,
        });
      }
    }
    cursor += len;
  });
  return { shots, totalBeats, startSec, spans };
}

/** Pick `count` clips: drop near-duplicates (best of each group), top scores, then chronological if asked. */
export function pickClips(clips: AssemblyClip[], count: number, chronological: boolean, seed: number, variety = 0): AssemblyClip[] {
  if (count <= 0) return [];
  const rng = makeRng(seed);
  const jitter = new Map(clips.map((c) => [c.assetId, rng()]));
  const eff = (c: AssemblyClip) => c.score * (1 - variety) + jitter.get(c.assetId)! * variety;
  const rank = (a: AssemblyClip, b: AssemblyClip) =>
    eff(b) - eff(a) || (jitter.get(a.assetId)! - jitter.get(b.assetId)!) || a.assetId.localeCompare(b.assetId);
  const bestPerGroup = new Map<string, AssemblyClip>();
  const ungrouped: AssemblyClip[] = [];
  for (const c of [...clips].sort(rank)) {
    if (!c.groupId) ungrouped.push(c);
    else if (!bestPerGroup.has(c.groupId)) bestPerGroup.set(c.groupId, c);
  }
  const pool = [...ungrouped, ...bestPerGroup.values()].sort(rank).slice(0, count);
  if (!chronological) return pool;
  return pool.sort((a, b) =>
    (a.captureTimeMs ?? Infinity) - (b.captureTimeMs ?? Infinity) || a.name.localeCompare(b.name) || a.assetId.localeCompare(b.assetId));
}

function uniqueUsable(clips: AssemblyClip[]): number {
  const groups = new Set<string>();
  let n = 0;
  for (const c of clips) {
    if (!c.groupId) n += 1;
    else if (!groups.has(c.groupId)) { groups.add(c.groupId); n += 1; }
  }
  return n;
}

/** Honour validated AI picks first (kept in the order given), then top up with the heuristic. */
export function pickWithPreferred(
  clips: AssemblyClip[], preferred: string[], count: number, chronological: boolean, seed: number,
): AssemblyClip[] {
  if (count <= 0) return [];
  const byId = new Map(clips.map((c) => [c.assetId, c]));
  const chosen: AssemblyClip[] = [];
  const usedGroups = new Set<string>();
  for (const id of preferred) {
    const c = byId.get(id);
    if (!c || chosen.includes(c) || (c.groupId && usedGroups.has(c.groupId))) continue;
    chosen.push(c);
    if (c.groupId) usedGroups.add(c.groupId);
    if (chosen.length === count) break;
  }
  if (chosen.length < count) {
    const rest = clips.filter((c) => !chosen.includes(c) && !(c.groupId && usedGroups.has(c.groupId)));
    const fill = pickClips(rest, count - chosen.length, chronological, seed);
    chosen.push(...fill);
  }
  return chosen;
}

const POSITION_Y: Record<string, number> = { top: -38, upperThird: -22, center: 0, lowerThird: 22, bottomSafe: 30 };

function overlayActions(
  recipe: Recipe, spans: SectionSpan[], params: AssembleInput['params'], texts: Record<string, string>,
  tag: string, seed: number, warnings: string[],
): AtomicAction[] {
  const out: AtomicAction[] = [];
  // flash accents sit on V2 and overlap long captions; one track cannot hold overlapping items, so captions go above them
  const textTrack = params.flashOnBars === true ? 'V3' : 'V2';
  const beatFrames = (beat: number, span: SectionSpan) => {
    // linear within the section; beats are even enough for placing a title
    return span.startFrame + Math.round(((span.endFrame - span.startFrame) * beat) / Math.max(1, span.lengthBeats));
  };
  recipe.structure.forEach((section, si) => {
    const span = spans.find((s) => s.section === section.section);
    if (!span) return;
    (section.overlays ?? []).forEach((ov, oi) => {
      if (ov.kind === 'captions') return; // captions come from transcription (M5)
      const text = renderTemplate(ov.text ?? '', { inputs: texts, params }).trim();
      if (!text) return; // optional input left empty
      const startBeat = ov.atBeat ?? 0;
      const startFrame = beatFrames(startBeat, span);
      const endFrame = ov.durationBeats ? beatFrames(Math.min(span.lengthBeats, startBeat + ov.durationBeats), span) : span.endFrame;
      const style = (ov.styleId ? recipe.styles[ov.styleId] : undefined) ?? {};
      const size = typeof style.sizePx === 'number' ? style.sizePx : 96;
      if (recipe.constraints?.textSafeZone !== false && (ov.position === 'top' || ov.position === 'bottomSafe')) {
        warnings.push(`overlay ${section.section}/${oi}: position ${ov.position} sits near the Instagram UI`);
      }
      out.push({
        type: 'add',
        item: {
          id: stableId('rs-t', tag, seed, si, oi), track: textTrack, kind: 'text', name: text.slice(0, 24),
          durationInFrames: Math.max(1, endFrame - startFrame), width: recipe.canvas.width, height: recipe.canvas.height,
          props: {
            text: style.textTransform === 'uppercase' ? text.toUpperCase() : text,
            fontSize: fitFontSize(text, size, recipe.canvas.width, style.textTransform === 'uppercase', typeof style.fontFamily === 'string' ? style.fontFamily : undefined), color: typeof style.color === 'string' ? style.color : '#ffffff',
            fontWeight: typeof style.fontWeight === 'number' ? style.fontWeight : 700,
            fontFamily: typeof style.fontFamily === 'string' ? style.fontFamily : undefined,
            align: 'center', rsSection: section.section,
          },
          transform: { y: POSITION_Y[ov.position ?? 'center'] ?? 0 },
        } as never,
        startFrame,
      });
    });
  });
  return out;
}

const dbToGain = (db: number) => 10 ** (db / 20);

export function assembleBeatMontage(input: AssembleInput): AssembleResult {
  const { recipe, clips, music, params, seed, texts } = input;
  const run: RecipeRunRecord = {
    recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy,
    seed, params, texts, assetIds: clips.map((c) => c.assetId).sort(),
  };
  const warnings: string[] = [];
  const empty = (report: Partial<AssembleReport>): AssembleResult => ({
    action: null, run,
    report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings, ...report },
  });
  if (!music) { warnings.push('music is required for beat-montage@1'); return empty({}); }
  if (music.beatTimesSec.length < 2) { warnings.push('music has no usable beat grid'); return empty({}); }

  const policy = recipe.constraints?.insufficientMediaPolicy ?? 'lengthenShots';
  const usable = uniqueUsable(clips);
  let stretch = 1;
  let plan = planShots(recipe, music, params, stretch);
  if (policy === 'lengthenShots') {
    // lengthen the flexible sections' shots until there is a unique clip for each shot
    while (plan.shots.length > usable && stretch < 16) { stretch *= 2; plan = planShots(recipe, music, params, stretch); }
    if (stretch > 1) warnings.push(`shots lengthened ${stretch}x to fit ${usable} clips`);
  } else if (policy === 'askUser' && plan.shots.length > usable) {
    warnings.push(`need ${plan.shots.length} clips, have ${usable}`);
    return empty({ shots: plan.shots.length, musicStartSec: plan.startSec, needsMoreMedia: { have: usable, need: plan.shots.length } });
  }
  const onlySection = input.onlySection;
  const allShots = plan.shots;
  const shots = onlySection ? allShots.filter((s) => s.section === onlySection.name) : allShots;
  const shotIndex = (s: PlannedShot) => allShots.indexOf(s);
  const unbiased = onlySection ? clips.filter((c) => !onlySection.excludeAssetIds.includes(c.assetId)) : clips;
  const pool = recipe.casting ? applyCastingBias(unbiased, recipe.casting) : unbiased;
  const allowRepeat = policy === 'allowRepeat';
  const chronological = recipe.constraints?.keepChronological ?? true;
  // RS-109: cast by what the shots show, when the recipe asks for it, tags exist and the agent did not choose
  const cast = !input.preferredAssetIds?.length && !onlySection && (recipe.casting || pool.some((c) => c.shot))
    ? castSlots(pool, shots.length, recipe.casting ?? {}, { openerSlot: 0, closerSlot: shots.length - 1, chronological }) : null;
  let picked = input.preferredAssetIds?.length
    ? pickWithPreferred(pool, input.preferredAssetIds, shots.length, chronological, seed)
    : cast ? planToOrder(cast)
    : pickClips(pool, shots.length, chronological, seed, input.variety ?? 0);
  if (cast) warnings.push(cast.note);
  // the user's chosen opener takes the first shot; it is never repeated, nor is a near-duplicate of it
  const opener = !onlySection && input.openerAssetId ? pool.find((c) => c.assetId === input.openerAssetId) : undefined;
  if (opener) {
    const rest = picked.filter((c) => c !== opener && !(opener.groupId && c.groupId === opener.groupId));
    picked = [opener, ...rest].slice(0, Math.max(1, Math.min(shots.length, picked.length + (picked.includes(opener) ? 0 : 1))));
  } else if (input.openerAssetId && !onlySection) warnings.push('the clip chosen to open the reel is not among the selected clips');
  if (picked.length < shots.length) {
    if (!allowRepeat) {
      shots.length = picked.length; // out of footage: drop trailing shots
      warnings.push('not enough clips: reel shortened');
    } else {
      const base = picked;
      picked = shots.map((_, i) => base[i % base.length]!);
    }
  }
  if (!picked.length) return empty({ musicStartSec: plan.startSec });

  const fps = fpsOf(recipe);
  const actions: AtomicAction[] = [];
  const tag = `${recipe.id}@${recipe.version}`;
  const startSrc = Math.round(plan.startSec * fps);
  const shotIds: string[] = [];
  // a clip too short (or too chopped up) for its shot is swapped for the best unused clip that fits, instead of failing the whole reel
  const placements: Array<ReturnType<typeof sourcePlacement> | undefined> = [];
  {
    const taken = new Set(picked.map((c) => c.assetId));
    const spare = [...pool].filter((c) => !taken.has(c.assetId)).sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId));
    const groups = new Set(picked.flatMap((c) => (c.groupId ? [c.groupId] : [])));
    shots.forEach((shot, i) => {
      const fit = (clip: AssemblyClip) => (clip.kind === 'video' ? sourcePlacement(clip, shot.durationInFrames) : undefined);
      try { placements[i] = fit(picked[i]!); return; } catch (error) {
        const bad = picked[i]!;
        const k = spare.findIndex((c) => !(c.groupId && groups.has(c.groupId)) && (() => { try { fit(c); return true; } catch { return false; } })());
        if (k < 0) throw error;
        const [swap] = spare.splice(k, 1);
        if (swap!.groupId) groups.add(swap!.groupId);
        picked[i] = swap!;
        placements[i] = fit(swap!);
        warnings.push(`${bad.name} is too short for a shot and was replaced by ${swap!.name}`);
      }
    });
  }
  shots.forEach((shot, i) => {
    const clip = picked[i]!;
    const last = i === shots.length - 1;
    // the last shot runs to the end of the reel so the music and picture end together
    const duration = shot.durationInFrames;
    const id = stableId('rs', tag, onlySection ? 'sec' : seed, shotIndex(shot), onlySection ? seed : 0);
    shotIds.push(id);
    const isVideo = clip.kind === 'video';
    const placement = placements[i];
    const srcIn = placement?.srcInFrame;
    const rate = placement?.playbackRate;
    if (isVideo && rate !== undefined && rate < 0.5) warnings.push(`shot ${i + 1}: source is short, slowed to ${rate.toFixed(2)}x`);
    actions.push({
      type: 'add',
      item: {
        id, track: 'V1', kind: clip.kind, name: clip.name, src: clip.src, durationInFrames: duration,
        sourceAssetId: clip.assetId,
        props: { rsSection: shot.section, rsRun: tag },
        ...(isVideo ? { srcInFrame: srcIn, playbackRate: rate === 1 ? undefined : rate, volume: dbToGain(recipe.music?.clipAudioGainDb ?? -96) } : {}),
      },
      startFrame: shot.startFrame,
    });
    void last;
  });
  if (!onlySection && params.flashOnBars === true) {
    const bpb = music.beatsPerBar;
    for (const span of plan.spans.filter((x) => recipe.structure.find((y) => y.section === x.section)?.transition === 'flash')) {
      for (let b = 0; b < span.lengthBeats; b += bpb) {
        const f = span.startFrame + Math.round(((span.endFrame - span.startFrame) * b) / Math.max(1, span.lengthBeats));
        actions.push({
          type: 'add',
          item: {
            id: stableId('rs-f', tag, seed, span.section, b), track: 'V2', kind: 'solid', name: 'Flash',
            durationInFrames: 5, width: recipe.canvas.width, height: recipe.canvas.height,
            props: { color: '#ffffff', rsSection: span.section }, transform: { opacity: 0.85 }, fadeOutFrames: 5,
          } as never,
          startFrame: f,
        });
      }
    }
  }
  {
    // RS-412: transitions named by the sections (Flash stays a solid accent when the recipe has the flashOnBars param)
    const tctx = {
      options: recipe.assembler.options, params, seed, fps,
      legacyFlash: recipe.params.some((p) => p.id === 'flashOnBars'),
    };
    const placed = shots.slice(0, shotIds.length);
    actions.push(...transitionActions(placed, shotIds, pickTransitions(placed, tctx), tctx, tag, onlySection ? `sec${seed}` : seed));
  }
  if (!onlySection) actions.push(...overlayActions(recipe, plan.spans, params, texts, tag, seed, warnings));
  const lastShot = allShots[allShots.length - 1]!;
  // a closing `fill: none` section (a black end card) is part of the reel, so the music and the timeline cover it
  const lastSpan = plan.spans[plan.spans.length - 1];
  const endsOnCard = !onlySection && lastSpan && recipe.structure.find((x) => x.section === lastSpan.section)?.fill === 'none';
  const total = Math.max(lastShot.startFrame + lastShot.durationInFrames, endsOnCard ? lastSpan.endFrame : 0);
  if (music && !onlySection) {
    const fadeOut = musicFadeFrames(recipe, fps, total, 'hardCut');
    actions.push({
      type: 'add',
      item: {
        id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
        durationInFrames: total, srcInFrame: startSrc, sourceAssetId: music.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? 0),
        ...(fadeOut > 0 ? { fadeOutFrames: fadeOut } : {}),
      },
      startFrame: 0,
    });
  }
  const report: AssembleReport = {
    shots: shots.length, usedAssetIds: picked.map((c) => c.assetId), musicStartSec: plan.startSec,
    totalFrames: total, warnings,
  };
  return { action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, report, run };
}
