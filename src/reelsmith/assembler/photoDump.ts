// photo-dump@1: a photo-only reel. It reuses the beat-montage cutter (so the cuts land on beats, or on a steady pulse when
// there is no song, because audio is often added later in Instagram) and gives every photo its own slow Ken Burns move,
// so a run of stills never looks like a slideshow. With `depthMotion` (RS-1238) the move is a 3D camera move through the
// photo's depth instead (photo-parallax: dolly, orbit, rise in turn); without the Photo depth model that is a plain push
// or pan. No AI involved; same inputs + seed => same actions.
import { fillTransformForFocus } from '../cropFocus';
import { kenBurnsActions, pictureExtent, presetForFit, type KenBurnsPreset } from '../kenBurns';
import { assembleBeatMontage } from './beatMontage';
import { metronome } from './common';
import { PARALLAX_MOVES, PHOTO_PARALLAX_FX } from '../../gl/fx/depthFx';
import type { AssembleInput, AssembleResult, AssemblyMusic } from './types';

/** Alternate pushes, pulls and pans so neighbouring photos never move the same way. */
const ROTATION: KenBurnsPreset[] = ['push-in', 'drift-up', 'pull-out', 'pan-right', 'drift-down', 'pan-left'];
export const PHOTO_DUMP_BPM = 120;

const BEATS_PER_SHOT: Record<string, number> = { everyBeat: 1, every2Beats: 2, everyBar: 4 };

/** Seconds per beat of the song (or the stand-in pulse): the median gap, so one odd beat cannot skew it. */
function beatSeconds(music: AssemblyMusic): number {
  const gaps = music.beatTimesSec.slice(1).map((t, i) => t - music.beatTimesSec[i]!).filter((g) => g > 0.15 && g < 2).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 60 / PHOTO_DUMP_BPM;
}

/**
 * The reel is as long as it takes to show every photo once, up to the recipe's maximum: photos x beats per shot x beat
 * length. (Left to itself the cutter only doubles shot length, which would drop photos to fit a fixed target.)
 */
export function fitToPhotos(input: AssembleInput, music: AssemblyMusic): NonNullable<AssembleInput['recipe']['duration']> {
  const duration = input.recipe.duration ?? { mode: 'fitMusic' as const, minSec: 6, targetSec: 15, maxSec: 40 };
  const distinct = new Set(input.clips.map((c) => c.groupId ?? c.assetId)).size;
  const rule = typeof input.params.cutRule === 'string' ? input.params.cutRule : input.recipe.structure[0]?.cutRule ?? 'every2Beats';
  const wanted = distinct * (BEATS_PER_SHOT[rule] ?? 2) * beatSeconds(music);
  // no minimum: a floor above photos x shot length would force more slots than photos and drop photos to fit
  const target = Math.min(duration.maxSec ?? 40, wanted);
  return { ...duration, targetSec: Math.round(target * 100) / 100 };
}

export function assemblePhotoDump(input: AssembleInput): AssembleResult {
  const strategy = input.recipe.assembler.strategy;
  const silent = !input.music;
  const moves = input.params.motion !== false;
  const depth = moves && input.params.depthMotion === true;
  const music = input.music ?? metronome(Math.max(60, (input.recipe.duration?.maxSec ?? 40) + 10), PHOTO_DUMP_BPM);
  const base = assembleBeatMontage({
    ...input,
    recipe: { ...input.recipe, assembler: { ...input.recipe.assembler, strategy: 'beat-montage@1' }, duration: fitToPhotos(input, music) },
    music,
  });
  const run = { ...base.run, assembler: strategy };
  if (!base.action) return { ...base, run };

  const start = Math.abs(Math.round(input.seed)) % ROTATION.length;
  const clips = new Map(input.clips.map((c) => [c.assetId, c]));
  const out: typeof base.action.actions = [];
  let photos = 0;
  for (const action of base.action.actions) {
    // the stand-in metronome has no file: it must not become an audio clip
    if (silent && action.type === 'add' && action.item.kind === 'audio') continue;
    if (depth && action.type === 'add' && action.item.kind === 'image') {
      const move = (start + photos) % PARALLAX_MOVES.length;
      photos += 1;
      out.push({ ...action, item: { ...action.item, effects: [...(action.item.effects ?? []), { id: `${action.item.id}-plx`, assetId: PHOTO_PARALLAX_FX, overrides: { move, strength: 1 } }] } });
      continue;
    }
    out.push(action);
    if (moves && action.type === 'add' && action.item.kind === 'image') {
      const clip = clips.get(String(action.item.sourceAssetId));
      // runRecipe fills the canvas with each photo after this step (withCropFocus), so the cover zoom must start from that scale or the two stack
      const fill = !action.item.transform && clip?.width && clip.height && input.recipe.canvas
        ? fillTransformForFocus(clip.width, clip.height, input.recipe.canvas.width, input.recipe.canvas.height) : null;
      const fit = { src: { width: clip?.width, height: clip?.height, transform: action.item.transform ?? (fill ? { scale: fill.scale } : undefined) }, canvas: input.recipe.canvas };
      const preset = presetForFit(ROTATION[(start + photos) % ROTATION.length]!, pictureExtent(fit.src, fit.canvas));
      photos += 1;
      out.push(...kenBurnsActions({ id: action.item.id, durationInFrames: action.item.durationInFrames }, preset, fit));
    }
  }
  const warnings = [...base.report.warnings];
  if (silent) warnings.push('no song: cuts follow a steady pulse; add your audio in Instagram');
  if (moves && photos) warnings.push(depth ? `${photos} photo${photos === 1 ? '' : 's'} got a 3D camera move (dolly, orbit or rise)` : `${photos} photo${photos === 1 ? '' : 's'} got a slow push, pull or pan`);
  return { ...base, action: { ...base.action, actions: out }, run, report: { ...base.report, warnings } };
}
