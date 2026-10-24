// captioned-story@1: talking clips with pauses tightened and fillers, stutters and abandoned takes cut (never mid-word),
// word-timed captions, B-roll over sentences, and an opening hook title. Each talking clip becomes the pieces it keeps
// (speechCleanup.ts): a video plays its source straight through, so a pause or a word only goes with a real cut.
import { matchBroll } from './brollMeaning';
import { renderTemplate } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import type { EditOpts } from '../../transcript/edit';
import { CLEANUP_LEVELS, cleanupIndices, placeWords, speechCuts, type CleanupLevel } from '../speechCleanup';
import { clipItem, dbToGain, fpsOf, textItem } from './common';
import { musicStartSec, pickClips, pickWithPreferred } from './beatMontage';
import { musicEndFrame, musicFadeFrames } from '../musicPolicy';
import { captionsFor } from '../captionStyles';
import { stableId } from './rng';
import type { AssembleInput, AssembleResult, AssemblyClip } from './types';

const DEFAULT_THRESHOLDS: Record<string, number> = { light: 900, balanced: 600, tight: 350 };

export function tightenOpts(level: string, thresholds: Record<string, number>, keepBreathMs: number, fps: number): EditOpts {
  const ms = level === 'off' ? undefined : thresholds[level] ?? DEFAULT_THRESHOLDS[level];
  if (ms === undefined) return {};
  return { maxGapFrames: Math.round((ms / 1000) * fps), cutPadFrames: Math.round((keepBreathMs / 1000) * fps) };
}

export function assembleCaptionedStory(input: AssembleInput): AssembleResult {
  const { recipe, params, seed, texts } = input;
  const fps = fpsOf(recipe);
  const warnings: string[] = [];
  const run = {
    recipeId: recipe.id, recipeVersion: recipe.version, assembler: recipe.assembler.strategy, seed, params, texts,
    assetIds: [...input.clips, ...(input.broll ?? [])].map((c) => c.assetId).sort(),
  };
  const fail = (m: string): AssembleResult => {
    warnings.push(m);
    return { action: null, run, report: { shots: 0, usedAssetIds: [], musicStartSec: 0, totalFrames: 0, warnings } };
  };
  let talking = input.clips.filter((c) => c.kind === 'video' && c.transcript?.length);
  for (const c of input.clips) if (!c.transcript?.length) warnings.push(`${c.name}: no transcript yet`);
  if (!talking.length) return fail('transcribe the talking clips first: install a speech model in Settings → Local AI, then transcribe each clip (right-click it in My Media)');
  talking.sort((a, b) => (a.captureTimeMs ?? Infinity) - (b.captureTimeMs ?? Infinity) || a.name.localeCompare(b.name));

  if (input.preferredAssetIds?.length) talking = pickWithPreferred(talking, input.preferredAssetIds, talking.length, true, seed);

  const opts = recipe.assembler.options ?? {};
  const level = String(params.tighten ?? 'balanced');
  const thresholds = (opts.pauseThresholdMs as Record<string, number>) ?? DEFAULT_THRESHOLDS;
  const maxPauseMs = level === 'off' ? undefined : thresholds[level] ?? DEFAULT_THRESHOLDS[level];
  const cleanLevel: CleanupLevel = (CLEANUP_LEVELS as readonly string[]).includes(level) ? level as CleanupLevel : 'balanced';
  const breathMs = Number(opts.keepBreathMs ?? 120);
  const tag = `${recipe.id}@${recipe.version}`;
  const actions: AtomicAction[] = [];
  const sentenceStarts: Array<{ frame: number; end: number; text: string }> = [];
  const removed = { fillers: 0, stutters: 0, retakes: 0 };
  let cursor = 0;

  talking.forEach((clip, i) => {
    const words = clip.transcript!;
    const clean = cleanupIndices(words, cleanLevel);
    removed.fillers += clean.fillers.length; removed.stutters += clean.stutters.length; removed.retakes += clean.retakes.length;
    const deleted = new Set(clean.idxs);
    const cuts = speechCuts(words, deleted, fps, { srcInFrame: 0, srcFrames: clip.durationInFrames }, maxPauseMs, breathMs);
    if (!cuts.length) { warnings.push(`${clip.name}: no words left to keep`); return; }
    const clipStart = cursor;
    cuts.forEach((cut, k) => {
      const act = clipItem(stableId('rs', tag, seed, 'talk', i, ...(k ? [k] : [])), { ...clip, sourceAnalysis: undefined, bestStartFrame: 0 }, 'V1', cut.srcFrames, {
        props: { rsSection: i === 0 ? 'hook' : 'story', rsRun: tag },
      }, 0);
      // every piece carries the transcript; captions on video show the words inside each piece's source window
      Object.assign((act as { item: Record<string, unknown> }).item, { kind: 'video', transcript: words, srcInFrame: cut.srcInFrame, playbackRate: undefined, volume: 1 });
      (act as { startFrame: number }).startFrame = cursor;
      actions.push(act);
      cursor += cut.srcFrames;
    });
    // sentence boundaries on the cut timeline
    const placed = placeWords(words, deleted, cuts, fps);
    let sStart = 0;
    placed.forEach((w, k) => {
      const next = placed[k + 1];
      if (/[.?!।]$/.test(w.text) || !next || next.startFrame - w.endFrame > Math.round(fps / 2)) {
        sentenceStarts.push({ frame: clipStart + placed[sStart]!.startFrame, end: clipStart + w.endFrame, text: placed.slice(sStart, k + 1).map((x) => x.text).join(' ') });
        sStart = k + 1;
      }
    });
  });
  const cleaned = removed.fillers + removed.stutters + removed.retakes;
  if (cleaned) warnings.push(`Cut ${[removed.fillers && `${removed.fillers} filler word${removed.fillers === 1 ? '' : 's'}`, removed.stutters && `${removed.stutters} stutter${removed.stutters === 1 ? '' : 's'}`, removed.retakes && `${removed.retakes} word${removed.retakes === 1 ? '' : 's'} of restarted sentences`].filter(Boolean).join(', ')} (${level}).`);
  const total = cursor;

  // captions follow the edited, tightened timeline
  actions.push({
    type: 'setCaptions',
    captions: {
      enabled: true, ...captionsFor(String(params.captionStyle ?? 'highlight-word')), sourceMode: 'timeline',
    } as never,
  });

  // B-roll over sentences, at most one per `brollEvery` seconds, never during the hook
  const pool = input.broll ?? [];
  const usedBroll: string[] = [];
  if (pool.length) {
    const gap = Math.round(Number(params.brollEvery ?? 6) * fps);
    const hookEnd = Math.round((recipe.structure.find((s) => s.section === 'hook')?.lengthSec ?? 3) * fps);
    const slots: Array<{ frame: number; dur: number; text: string }> = [];
    let last = -Infinity;
    for (const s of sentenceStarts) {
      if (s.frame < hookEnd || s.frame - last < gap) continue;
      const dur = Math.min(Math.round(2.5 * fps), s.end - s.frame);
      if (dur < fps) continue;
      slots.push({ frame: s.frame, dur, text: s.text });
      last = s.frame;
    }
    const usedGroups = new Set(talking.map((c) => c.groupId).filter(Boolean));
    const usedIds = new Set(talking.map((c) => c.assetId));
    const eligible = pool.filter((c) => !usedIds.has(c.assetId) && !(c.groupId && usedGroups.has(c.groupId)));
    let picks: AssemblyClip[];
    if (input.preferredBrollAssetIds?.length) {
      picks = pickWithPreferred(eligible, input.preferredBrollAssetIds, slots.length, false, seed);
    } else {
      // RS-204: with shot tags, each cutaway is the spare clip that fits what the sentence is about; else score order
      const byMeaning = matchBroll(slots.map((slot) => slot.text), pickClips(eligible, eligible.length, false, seed));
      picks = byMeaning.picks.slice(0, slots.length);
      if (byMeaning.note) warnings.push(byMeaning.note);
    }
    usedBroll.push(...picks.map((c) => c.assetId));
    if (picks.length < slots.length) warnings.push('fewer B-roll clips than slots');
    picks.forEach((clip, i) => {
      const act = clipItem(stableId('rs', tag, seed, 'broll', i), clip, 'V2', slots[i]!.dur, { props: { rsSection: 'story' } }, -96);
      (act as { startFrame: number }).startFrame = slots[i]!.frame;
      actions.push(act);
    });
  }

  const hook = recipe.structure.find((s) => s.section === 'hook')?.overlays?.find((o) => o.kind === 'title');
  const hookText = hook ? renderTemplate(hook.text ?? '', { inputs: texts, params }).trim() : '';
  if (hook && hookText) {
    const hookDur = Math.min(total, Math.round((recipe.structure.find((s) => s.section === 'hook')?.lengthSec ?? 3) * fps));
    actions.push(textItem(stableId('rs-t', tag, seed), hookText, 0, hookDur, recipe.canvas,
      (hook.styleId ? recipe.styles[hook.styleId] : undefined) ?? {}, -22, 'V3'));
  }
  let musicStart = 0;
  if (input.music) {
    const m = input.music;
    // RS-602: the song can start later (downbeat, loudest part, a chosen time) and stop on a bar; the speech sets the reel length
    musicStart = musicStartSec(recipe, m, params);
    const musicLen = musicEndFrame(recipe, m, musicStart, total, fps, 'fadeOut');
    const fade = musicFadeFrames(recipe, fps, musicLen, 'fadeOut');
    actions.push({
      type: 'add', startFrame: 0,
      item: {
        id: stableId('rs', tag, seed, 'music'), track: 'A1', kind: 'audio', name: m.name, src: m.src,
        durationInFrames: musicLen, srcInFrame: Math.round(musicStart * fps), sourceAssetId: m.assetId,
        volume: dbToGain(recipe.music?.gainDb ?? -18), ...(fade > 0 ? { fadeOutFrames: fade } : {}),
      } as never,
    });
  }
  return {
    action: { type: 'batch', actions, label: `Assemble ${recipe.name}` }, run,
    report: { shots: talking.length + usedBroll.length, usedAssetIds: [...talking.map((c) => c.assetId), ...usedBroll], musicStartSec: musicStart, totalFrames: total, warnings },
  };
}
