// beat-montage@1: cuts on beats/bars of the music, clips chosen by score and never repeated.
import type { Recipe, RecipeSection } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import { makeRng, stableId } from './rng';
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
  if (policy === 'loudestSection') {
    const t = music.loudestStartSec ?? downbeat;
    // snap to the nearest beat so the first cut lands on one
    return music.beatTimesSec.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), downbeat);
  }
  if (policy === 'userOffset') return Math.max(0, Number(params.musicOffsetSec ?? 0));
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

function targetBeatCount(recipe: Recipe, beats: number[], beatsPerBar: number): number {
  const d = recipe.duration ?? {};
  const maxSec = d.maxSec ?? d.targetSec ?? Infinity;
  const wantSec = Math.min(d.targetSec ?? maxSec, maxSec);
  let n = beats.findIndex((t) => t >= wantSec);
  if (n < 0) n = beats.length - 1;
  if ((recipe.music?.endPolicy ?? 'hardCut') === 'endOnBar') n = Math.floor(n / beatsPerBar) * beatsPerBar;
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

export function planShots(
  recipe: Recipe, music: AssemblyMusic, params: AssembleInput['params'], stretch: number,
): { shots: PlannedShot[]; totalBeats: number; startSec: number } {
  const fps = fpsOf(recipe);
  const startSec = musicStartSec(recipe, music, params);
  const beats = beatsFrom(music, startSec);
  const bpb = music.beatsPerBar;
  const totalBeats = Math.min(targetBeatCount(recipe, beats, bpb), beats.length - 1);
  const lens = sectionBeats(recipe.structure, totalBeats);
  const paramRule = typeof params.cutRule === 'string' ? params.cutRule : undefined;
  const shots: PlannedShot[] = [];
  let cursor = 0;
  recipe.structure.forEach((section, si) => {
    const len = Math.min(lens[si]!, totalBeats - cursor);
    if (len <= 0 || section.fill === 'none') { cursor += Math.max(0, len); return; }
    // a `cutRule` param drives the flexible (no lengthBeats) sections
    const rule = section.lengthBeats === undefined && paramRule ? paramRule : section.cutRule ?? 'everyBar';
    let step = (STEP_BEATS[rule] ?? STEP_BEATS.everyBar!)(bpb);
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
  return { shots, totalBeats, startSec };
}

/** Pick `count` clips: drop near-duplicates (best of each group), top scores, then chronological if asked. */
export function pickClips(clips: AssemblyClip[], count: number, chronological: boolean, seed: number): AssemblyClip[] {
  const rng = makeRng(seed);
  const jitter = new Map(clips.map((c) => [c.assetId, rng()]));
  const rank = (a: AssemblyClip, b: AssemblyClip) =>
    b.score - a.score || (jitter.get(a.assetId)! - jitter.get(b.assetId)!) || a.assetId.localeCompare(b.assetId);
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
  const shots = plan.shots;
  const allowRepeat = policy === 'allowRepeat';
  let picked = pickClips(clips, shots.length, recipe.constraints?.keepChronological ?? true, seed);
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
  shots.forEach((shot, i) => {
    const clip = picked[i]!;
    const last = i === shots.length - 1;
    // the last shot runs to the end of the reel so the music and picture end together
    const duration = shot.durationInFrames;
    const id = stableId('rs', tag, seed, i);
    const isVideo = clip.kind === 'video';
    const srcIn = isVideo ? Math.max(0, Math.min(clip.bestStartFrame ?? 0, Math.max(0, clip.durationInFrames - 1))) : undefined;
    const available = isVideo ? Math.max(1, clip.durationInFrames - (srcIn ?? 0)) : duration;
    const rate = isVideo ? Math.max(0.25, Math.min(1, available / duration)) : undefined;
    if (isVideo && rate !== undefined && rate < 0.5) warnings.push(`shot ${i + 1}: source is short, slowed to ${rate.toFixed(2)}x`);
    actions.push({
      type: 'add',
      item: {
        id, track: 'V1', kind: clip.kind, name: clip.name, src: clip.src, durationInFrames: duration,
        sourceAssetId: clip.assetId,
        ...(isVideo ? { srcInFrame: srcIn, playbackRate: rate === 1 ? undefined : rate, volume: dbToGain(recipe.music?.clipAudioGainDb ?? -96) } : {}),
      },
      startFrame: shot.startFrame,
    });
    void last;
  });
  const total = shots[shots.length - 1]!.startFrame + shots[shots.length - 1]!.durationInFrames;
  if (music) {
    const endPolicy = recipe.music?.endPolicy ?? 'hardCut';
    const fadeOut = Math.round((recipe.music?.fadeOutSec ?? 0) * fps);
    actions.push({
      type: 'add',
      item: {
        id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
        durationInFrames: total, srcInFrame: startSrc, sourceAssetId: music.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? 0),
        ...(endPolicy === 'fadeOut' || fadeOut > 0 ? { fadeOutFrames: Math.min(fadeOut, total) } : {}),
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
