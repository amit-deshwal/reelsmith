// collage-grid@1: split2v -> grid2x2 -> split3v -> grid3x3 ..., tiles revealed one by one on the beat, then a hero shot.
import { renderTemplate } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import { placeInSlot, type SlotRect } from '../../editor/layouts';
import { clipItem, dbToGain, fpsOf, metronome, textItem } from './common';
import { pickClips, pickWithPreferred, musicStartSec } from './beatMontage';
import { stableId } from './rng';
import { musicEndFrame, musicFadeFrames } from '../musicPolicy';
import type { AssembleInput, AssembleResult } from './types';

const rows = (n: number): SlotRect[] => Array.from({ length: n }, (_, i) => ({ x: 0, y: i / n, w: 1, h: 1 / n }));
const grid = (n: number): SlotRect[] =>
  Array.from({ length: n * n }, (_, i) => ({ x: (i % n) / n, y: Math.floor(i / n) / n, w: 1 / n, h: 1 / n }));

export const LAYOUT_SLOTS: Record<string, SlotRect[]> = {
  split2v: rows(2), split2h: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  split3v: rows(3), grid2x2: grid(2), grid3x3: grid(3),
};

/** Shrink a slot by a gutter (px) on every inner edge, keeping the outer margin equal to half a gutter. */
export function withGutter(slot: SlotRect, gutterPx: number, canvas: { width: number; height: number }): SlotRect {
  const gx = gutterPx / 2 / canvas.width;
  const gy = gutterPx / 2 / canvas.height;
  return { x: slot.x + gx, y: slot.y + gy, w: Math.max(0.01, slot.w - 2 * gx), h: Math.max(0.01, slot.h - 2 * gy) };
}

export function assembleCollageGrid(input: AssembleInput): AssembleResult {
  const { recipe, params, seed, texts } = input;
  const fps = fpsOf(recipe);
  const warnings: string[] = [];
  const run = {
    recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy, seed, params, texts,
    assetIds: input.clips.map((c) => c.assetId).sort(),
  };
  const empty = (msg: string): AssembleResult => {
    warnings.push(msg);
    return { action: null, run, report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings } };
  };
  const sequence = ((recipe.assembler.options?.sequence as string[] | undefined) ?? ['split2v', 'grid2x2', 'split3v', 'grid3x3'])
    .filter((l) => LAYOUT_SLOTS[l]);
  if (!sequence.length) return empty('no layouts');

  const durCfg = recipe.duration ?? {};
  const targetSec = Math.min(durCfg.targetSec ?? 18, durCfg.maxSec ?? 40);
  const music = input.music;
  const grid0 = music ?? metronome(targetSec + 10);
  const startSec = music ? musicStartSec(recipe, music, params) : 0;
  const beats = grid0.beatTimesSec.filter((b) => b >= startSec - 1e-3).map((b) => Math.max(0, b - startSec));
  const bpb = grid0.beatsPerBar;
  const frameAtBeat = (b: number) => Math.round((beats[Math.min(Math.round(b), beats.length - 1)] ?? 0) * fps);

  const heroSection = recipe.structure.find((s) => s.section === 'hero');
  const heroBeats = heroSection?.lengthBeats ?? 8;
  let totalBeats = Math.floor(targetSec / ((beats[1] ?? 0.5) - (beats[0] ?? 0)));
  totalBeats = Math.min(beats.length - 1, Math.floor(totalBeats / bpb) * bpb);
  const gridBeats = Math.max(bpb, totalBeats - heroBeats);
  // each layout lasts one bar; stop when footage runs out (the last clip is kept for the hero)
  const layoutList: string[] = [];
  let needClips = 1;
  for (let b = 0, i = 0; b + bpb <= gridBeats; b += bpb, i += 1) {
    const l = sequence[i % sequence.length]!;
    if (needClips + LAYOUT_SLOTS[l]!.length > input.clips.length) break;
    layoutList.push(l);
    needClips += LAYOUT_SLOTS[l]!.length;
  }
  if (!layoutList.length) return empty(`need more clips (have ${input.clips.length})`);
  if (layoutList.length * bpb < gridBeats) warnings.push('footage ran short: the grid section is shorter than the target');

  const pickedAll = input.preferredAssetIds?.length
    ? pickWithPreferred(input.clips, input.preferredAssetIds, needClips, recipe.constraints?.keepChronological ?? false, seed)
    : pickClips(input.clips, needClips, recipe.constraints?.keepChronological ?? false, seed);
  // the picker can return fewer clips than asked (near-duplicates are skipped): drop layouts until they fit
  while (layoutList.length && needClips > pickedAll.length) needClips -= LAYOUT_SLOTS[layoutList.pop()!]!.length;
  if (!layoutList.length) return empty(`need more distinct clips (have ${pickedAll.length} after removing near-duplicates)`);
  if (needClips < pickedAll.length || layoutList.length * bpb < gridBeats) {
    if (!warnings.includes('footage ran short: the grid section is shorter than the target')) warnings.push('footage ran short: the grid section is shorter than the target');
  }
  const picked = pickedAll.slice(0, needClips);
  const hero = picked[picked.length - 1]!;
  let ci = 0;
  const tag = `${recipe.id}@${recipe.version}`;
  const gutter = Number(params.gutter ?? 12);
  const radius = Number(params.radius ?? 18);
  const stagger = Number(recipe.assembler.options?.revealStaggerBeats ?? 0.5);
  const actions: AtomicAction[] = [];
  const maxTiles = Math.max(...layoutList.map((l) => LAYOUT_SLOTS[l]!.length));

  // background + one track per tile position
  actions.push({
    type: 'add', startFrame: 0,
    item: {
      id: stableId('rs-bg', tag, seed), track: 'V1', kind: 'solid', name: 'Background',
      durationInFrames: 1, width: recipe.canvas.width, height: recipe.canvas.height,
      props: { color: String(params.bg ?? '#F4F1EA'), rsSection: 'grids' },
    } as never,
  });
  const bgIndex = actions.length - 1;
  void maxTiles;
  layoutList.forEach((layout, li) => {
    const startBeat = li * bpb;
    const lStart = frameAtBeat(startBeat);
    const lEnd = frameAtBeat(startBeat + bpb);
    LAYOUT_SLOTS[layout]!.forEach((slot, ti) => {
      const clip = picked[ci++]!;
      const revealFrame = Math.min(lEnd - 1, frameAtBeat(startBeat + ti * stagger));
      const start = Math.max(lStart, revealFrame);
      const transform = { ...placeInSlot(withGutter(slot, gutter, recipe.canvas), 'cover'), borderRadius: radius };
      const act = clipItem(stableId('rs', tag, seed, li, ti), clip, `G${ti + 1}`, Math.max(1, lEnd - start), {
        transform, props: { rsSection: 'grids', rsLayout: layout },
      }, -96);
      (act as { startFrame: number }).startFrame = start;
      actions.push(act);
    });
  });
  const endGrid = frameAtBeat(layoutList.length * bpb);
  const total = frameAtBeat(layoutList.length * bpb + heroBeats);
  // background spans the whole reel
  (actions[actions.findIndex((a) => (a as { item?: { id?: string } }).item?.id === stableId('rs-bg', tag, seed))] as { item: { durationInFrames: number } })
    .item.durationInFrames = total;
  void bgIndex;
  const heroAct = clipItem(stableId('rs', tag, seed, 'hero'), hero, 'G1', Math.max(1, total - endGrid), { props: { rsSection: 'hero' } }, -96);
  (heroAct as { startFrame: number }).startFrame = endGrid;
  actions.push(heroAct);
  const title = heroSection?.overlays?.find((o) => o.kind === 'title');
  const titleText = title ? renderTemplate(title.text ?? '', { inputs: texts, params }).trim() : '';
  if (title && titleText) {
    actions.push(textItem(stableId('rs-t', tag, seed), titleText, endGrid, Math.max(1, total - endGrid), recipe.canvas,
      (title.styleId ? recipe.styles[title.styleId] : undefined) ?? {}, 0, 'T1'));
  }
  if (music) {
    const musicLen = musicEndFrame(recipe, music, startSec, total, fps, 'fadeOut');
    const fade = musicFadeFrames(recipe, fps, musicLen, 'fadeOut');
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
        durationInFrames: musicLen, srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? -4), ...(fade > 0 ? { fadeOutFrames: fade } : {}),
      } as never,
    });
  }
  return {
    action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, run,
    report: { shots: ci + 1, usedAssetIds: picked.map((c) => c.assetId), musicStartSec: startSec, totalFrames: total, warnings },
  };
}
