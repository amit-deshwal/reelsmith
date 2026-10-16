// captioned-story@1: talking clips with pauses tightened (never mid-word), word-timed captions,
// B-roll over sentences, and an opening hook title.
import { renderTemplate } from '../../../shared/reelsmith/recipe';
import type { AtomicAction } from '../../editor/reducerActions';
import { editedFrames, projectRetimedWords, type EditOpts } from '../../transcript/edit';
import { clipItem, dbToGain, fpsOf, textItem } from './common';
import { musicStartSec, pickClips, pickWithPreferred } from './beatMontage';
import { musicEndFrame, musicFadeFrames } from '../musicPolicy';
import { captionsFor } from '../captionStyles';
import { stableId } from './rng';
import type { AssembleInput, AssembleResult } from './types';

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
  const edit = tightenOpts(level, (opts.pauseThresholdMs as Record<string, number>) ?? DEFAULT_THRESHOLDS, Number(opts.keepBreathMs ?? 120), fps);
  const tag = `${recipe.id}@${recipe.version}`;
  const actions: AtomicAction[] = [];
  const none = new Set<number>();
  const sentenceStarts: Array<{ frame: number; end: number }> = [];
  let cursor = 0;

  talking.forEach((clip, i) => {
    const words = clip.transcript!;
    const dur = editedFrames(words, none, fps, edit);
    const act = clipItem(stableId('rs', tag, seed, 'talk', i), { ...clip, sourceAnalysis: undefined, bestStartFrame: 0 }, 'V1', dur, {
      props: { rsSection: i === 0 ? 'hook' : 'story', rsRun: tag },
    }, 0);
    const item = (act as { item: Record<string, unknown> }).item;
    Object.assign(item, {
      kind: 'video', transcript: words, srcInFrame: undefined, playbackRate: undefined,
      volume: 1, silenceFrames: edit.maxGapFrames, cutPadFrames: edit.cutPadFrames,
    });
    (act as { startFrame: number }).startFrame = cursor;
    actions.push(act);
    // sentence boundaries on the edited timeline
    const proj = projectRetimedWords(words, none, fps, 0, edit);
    let sStart = 0;
    proj.words.forEach((w, k) => {
      const next = proj.words[k + 1];
      const endsSentence = /[.?!।]$/.test(w.text) || !next || next.start - w.end > 500;
      if (endsSentence) {
        sentenceStarts.push({ frame: cursor + Math.round((proj.words[sStart]!.start / 1000) * fps), end: cursor + Math.round((w.end / 1000) * fps) });
        sStart = k + 1;
      }
    });
    cursor += dur;
  });
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
    const slots: Array<{ frame: number; dur: number }> = [];
    let last = -Infinity;
    for (const s of sentenceStarts) {
      if (s.frame < hookEnd || s.frame - last < gap) continue;
      const dur = Math.min(Math.round(2.5 * fps), s.end - s.frame);
      if (dur < fps) continue;
      slots.push({ frame: s.frame, dur });
      last = s.frame;
    }
    const usedGroups = new Set(talking.map((c) => c.groupId).filter(Boolean));
    const usedIds = new Set(talking.map((c) => c.assetId));
    const eligible = pool.filter((c) => !usedIds.has(c.assetId) && !(c.groupId && usedGroups.has(c.groupId)));
    const picks = input.preferredBrollAssetIds?.length
      ? pickWithPreferred(eligible, input.preferredBrollAssetIds, slots.length, false, seed)
      : pickClips(eligible, slots.length, false, seed);
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
