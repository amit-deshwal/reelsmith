// story-vlog@1: clips in capture-time order, a moment label per time group, an occasional 2-up split,
// cuts on bars (with a song) or at the typical shot length (without).
import type { AtomicAction } from '../../editor/reducerActions';
import { placeInSlot } from '../../editor/layouts';
import { clipItem, dbToGain, fpsOf, metronome, textItem } from './common';
import { stableId } from './rng';
import { musicEndFrame, musicFadeFrames } from '../musicPolicy';
import { musicStartSec, pickClips, pickWithPreferred } from './beatMontage';
import type { AssembleInput, AssembleResult, AssemblyClip } from './types';

export function formatMoment(ms: number, tzOffsetMin: number): string {
  const d = new Date(ms + tzOffsetMin * 60_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Home, Cafe; Beach" -> ['Home', 'Cafe', 'Beach']. Template braces are dropped so typed text is never expanded. */
export function parsePlaces(raw: string | undefined): string[] {
  return (raw ?? '').split(/[,;\n]/).map((p) => p.replace(/[{}]/g, '').trim()).filter(Boolean);
}

export function assembleStoryVlog(input: AssembleInput): AssembleResult {
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
  const clips = input.clips;
  if (!clips.length) return fail('no clips');

  const durCfg = recipe.duration ?? {};
  const targetSec = Math.min(durCfg.targetSec ?? durCfg.maxSec ?? 30, durCfg.maxSec ?? 90);
  const music = input.music;
  const grid = music ?? metronome(targetSec + 10);
  const startSec = music ? musicStartSec(recipe, music, params) : 0;
  const rel = grid.beatTimesSec.filter((b) => b >= startSec - 1e-3).map((b) => Math.max(0, b - startSec));
  const bpb = grid.beatsPerBar;
  const barSec = (rel[bpb] ?? bpb * 0.5) - (rel[0] ?? 0);

  // shot length: whole bars closest to the typical shot length (min 1 bar) when a song is present
  const shotLenSec = Math.max(0.5, Number(params.shotLen ?? 1.6));
  const bars = music ? Math.max(1, Math.round(shotLenSec / barSec)) : 0;
  const shotFrames = music ? Math.round((rel[bars * bpb] ?? bars * barSec) * fps) : Math.round(shotLenSec * fps);
  let slotCount = Math.max(1, Math.floor((targetSec * fps) / shotFrames));
  // The first shot always starts at frame 0 (the song's first beat can be a few frames in, which left an empty canvas).
  const shotStart = (i: number) => (i === 0 ? 0 : music ? Math.round((rel[Math.min(i * bars * bpb, rel.length - 1)] ?? 0) * fps) : i * shotFrames);

  const splitEvery = Math.max(0, Math.round(Number(params.splitEvery ?? 0)));
  const isSplit = (slot: number) => splitEvery > 0 && slot % splitEvery === splitEvery - 1;
  // clips needed = slots + number of split slots
  const needed = (n: number) => n + Array.from({ length: n }, (_, i) => i).filter(isSplit).length;
  const usable = new Set(clips.map((c) => c.groupId ?? c.assetId)).size;
  while (slotCount > 1 && needed(slotCount) > usable) slotCount -= 1;
  const picked = input.preferredAssetIds?.length
    ? pickWithPreferred(clips, input.preferredAssetIds, needed(slotCount), true, seed)
    : pickClips(clips, needed(slotCount), true, seed);
  while (slotCount > 1 && needed(slotCount) > picked.length) slotCount -= 1;
  const used = picked.slice(0, needed(slotCount));
  if (used.length < needed(slotCount)) return fail('not enough clips');

  const tz = Number(params.tzOffsetMin ?? 0);
  const labelMode = String(params.labels ?? 'timeAndPlace');
  const overlay = recipe.structure[0]?.overlays?.find((o) => o.kind === 'timestamp');
  const style = (overlay?.styleId ? recipe.styles[overlay.styleId] : undefined) ?? {};
  const clipGain = music ? recipe.music?.clipAudioGainDb ?? -20 : 0;
  const tag = `${recipe.id}@${recipe.version}`;
  const actions: AtomicAction[] = [];
  let ci = 0;
  let lastHour = -1;
  let momentIdx = 0;
  const places = parsePlaces(texts.places);
  let total = 0;
  for (let s = 0; s < slotCount; s += 1) {
    const start = shotStart(s);
    const end = s === slotCount - 1 ? Math.max(start + 1, shotStart(s + 1) || start + shotFrames) : shotStart(s + 1);
    const dur = Math.max(1, end - start);
    total = start + dur;
    const a = used[ci++]!;
    const place = (c: AssemblyClip, track: string, slot: 'top' | 'bottom' | null) => {
      const extra: Record<string, unknown> = { __start: start, props: { rsSection: 'body', rsRun: tag } };
      if (slot) extra.transform = placeInSlot(slot === 'top' ? { x: 0, y: 0, w: 1, h: 0.5 } : { x: 0, y: 0.5, w: 1, h: 0.5 }, 'cover');
      const act = clipItem(stableId('rs', tag, seed, s, track), c, track, dur, extra, clipGain);
      // strip the helper field before dispatch
      delete (act as { item: Record<string, unknown> }).item.__start;
      (act as { startFrame: number }).startFrame = start;
      actions.push(act);
    };
    if (isSplit(s)) {
      const b = used[ci++]!;
      place(a, 'V1', 'top');
      place(b, 'V2', 'bottom');
    } else place(a, 'V1', null);

    if (labelMode !== 'none' && a.captureTimeMs !== undefined) {
      const hour = new Date(a.captureTimeMs + tz * 60_000).getUTCHours();
      if (hour !== lastHour) {
        lastHour = hour;
        const when = formatMoment(a.captureTimeMs, tz);
        const where = labelMode === 'timeAndPlace' ? (a.place ?? places[momentIdx] ?? '') : '';
        momentIdx += 1;
        const text = where ? `${when} · ${where}` : when;
        const label = textItem(stableId('rs-l', tag, seed, s), text, start, dur, recipe.canvas, style, -22, 'V3');
        // part of the body section, so a re-cut replaces the labels together with the shots they describe
        (label as { item: { props: Record<string, unknown> } }).item.props = { ...(label as { item: { props: Record<string, unknown> } }).item.props, rsSection: 'body', rsRun: tag };
        actions.push(label);
      }
    }
  }
  if (music) {
    const musicLen = musicEndFrame(recipe, music, startSec, total, fps, 'fadeOut');
    const fade = musicFadeFrames(recipe, fps, musicLen, 'fadeOut');
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: music.name, src: music.src,
        durationInFrames: musicLen, srcInFrame: Math.round(startSec * fps), sourceAssetId: music.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? -6),
        ...(fade > 0 ? { fadeOutFrames: fade } : {}),
      } as never,
    });
  }
  return {
    action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, run,
    report: { shots: slotCount, usedAssetIds: used.map((c) => c.assetId), musicStartSec: startSec, totalFrames: total, warnings },
  };
}
