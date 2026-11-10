// Director mode tools (RS-1201): the agent reads the moves catalogue with the project's media in one call, then builds
// the reel from its own plan (sections of moves, clips, lines) in one more, as one undo step. Stage 1 (watching the
// footage) is in directorOptions.ts and re-exported here.
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { AgentContext } from '../../agent/context';
import type { AtomicAction } from '../../editor/reducerActions';
import type { MediaAsset } from '../../editor/types';
import { framesAllowed } from '../framePrivacy';
import { runRecipe } from '../runRecipe';
import { defaultValues } from '../setupForm';
import { directorRecipe, resolvePlanSections } from '../director/assembleDirector';
import { adoptCustomGraphics } from '../director/customGraphics';
import { commit, projectId, type ReelsDeps } from './reelsTools';
import { reviewDirectorPlan } from '../director/review';
import { pickFindings } from '../director/pickAudit';
import { finishDirectorActions, sectionSpans, stampDirector } from '../director/finishBuild';
import { lintReel } from '../reelLint';
import { execFramesTool } from '../../agent/tools/frames-tool';
import type { ClipFeatures } from '../assembler/scoring';
import { directorSession, restoreDirectorSession, savedDirector, updateDirectorSession } from '../director/directorSession';
import { PLAN_BRIEF, checkTreatment, parseTreatment, treatmentCard, treatmentIds } from '../director/treatment';
import { catalogKind, catalogSlice } from '../director/catalogText';
import { soundCheck } from '../director/soundCheck';
import { motionRuleText } from '../director/motionRules';
import { missingThings } from '../director/storyThings';
import type { Defect } from '../director/critique';
import { songMap } from '../director/songMap';
import { songReportLine } from '../exportMusic';
import { brandAction, brandWords } from '../../../shared/reelsmith/brandKit';
import { resolveVoiceover } from './directorVoiceover';
import { resolveLyrics } from './directorLyrics';
import { songVocalStarts } from './directorVocals';
import { directorVisuals, libraryMusic, shotTagsWarming, songGrid, tempo } from './directorOptions';
import { parseBrief, validatePlan, violationText, type PlanBrief, type PlanViolation } from '../director/validatePlan';
export { directorOptions, directorVisuals, footageRateFor, sheetSamples, songSuggestion, warmShotTagsFor, type FindShots } from './directorOptions';
const VISUAL = new Set(['video', 'image']);
const secs = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

/** The build's first step: the rate stage 1 chose, while nothing is placed yet (the editor locks it after that). */
function applyTimelineFps(ctx: AgentContext, want: number | undefined): void {
  if (!want || ctx.getState().fps === want || ctx.getState().items.length) return;
  ctx.commands.setProjectFps(want);
}

/** "#7" / "#7@4.5" → that clip's assetId (keeping the @start); anything else unchanged. */
export function resolveClipRef(ref: string, visual: readonly Pick<MediaAsset, 'id'>[]): string | null {
  const m = /^#(\d+)(@[\d.]+)?$/.exec(ref.trim());
  if (!m) return ref;
  const a = visual[Number(m[1]) - 1];
  return a ? `${a.id}${m[2] ?? ''}` : null;
}

/** What one build left behind, for the build, the critique and the fix to report from. */
export interface BuildOutcome {
  plan: ReelPlan;
  spans: Array<{ from: number; to: number }>;
  seconds: number;
  clipsUsed: number;
  notes: string[];
  added?: MediaAsset;
  findings: ReturnType<typeof reviewDirectorPlan>;
  lint: ReturnType<typeof lintReel>;
  builds: number;
}

/**
 * Validate, build and commit a plan as one undo step; record the build in the director session and save the run on
 * the reel (RS-1222). Shared by reels_director_build and reels_director_fix, which only report differently.
 */
export async function runBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<BuildOutcome | { error: string }> {
  const parsed = parsePlan(args.plan);
  if (!parsed.ok) return { error: `The plan is not valid: ${parsed.errors.join('; ')}` };
  const plan = parsed.plan;
  const id = projectId(ctx);
  const session = restoreDirectorSession(id, ctx.getState().items as never);
  // RS-1219: the treatment's tone sets how things move unless the plan names its own
  if (!plan.tone && session?.treatment) plan.tone = session.treatment.tone;
  // RS-1249: a shot list is built as written
  if (plan.shotList === undefined && session?.treatment?.shotList) plan.shotList = true;
  if (Array.isArray(args.keep)) plan.keep = args.keep as ReelPlan['keep'];
  // catalogue mistakes come back at once, before the clip analysis the build waits on
  // (a custom graphic already on the timeline from an earlier session is picked up again)
  adoptCustomGraphics(ctx.getState().items as never);
  const problems: string[] = [];
  // RS-1258: what the check repaired (a clamped value, a param left out) is reported with the build, not refused
  const repaired: string[] = [];
  resolvePlanSections(plan, repaired, problems);
  if (problems.length) return { error: `The plan has problems: ${problems.join('; ')}` };
  // RS-1230: with "show me the plan first", nothing is built until the user has answered the treatment card
  if (session?.askFirst && session.gate === 'waiting') {
    const said = typeof args.approvedBy === 'string' ? args.approvedBy.trim() : '';
    if (!said) return { error: 'The user asked to approve the treatment first. Show them the card from reels_director_treatment and wait for their reply; then build with approvedBy set to their words.' };
    updateDirectorSession(id, { gate: 'approved' });
  }
  // RS-1258: the footage rate stage 1 chose takes effect here, inside the build's own draft
  applyTimelineFps(ctx, session?.timelineFps);
  const state = ctx.getState();
  if (state.items.length > 0 && args.replaceTimeline !== true) return { error: 'The timeline already has items and building replaces it. Ask the user, then call again with replaceTimeline true (one undo step restores it).' };
  const assets = [...(ctx.getDoc().assets ?? [])];
  let added: MediaAsset | undefined;
  if (plan.music) {
    const want = plan.music.toLowerCase();
    const hit = [...assets.filter((a) => a.kind === 'audio'), ...libraryMusic(ctx)].find((a) => a.id.toLowerCase() === want || a.name.toLowerCase() === want);
    if (!hit) return { error: `unknown music ${JSON.stringify(plan.music)}; use a song assetId from reels_director_options` };
    if (!assets.some((a) => a.id === hit.id)) { assets.push(hit); added = hit; }
    plan.music = hit.id;
  }
  // RS-1267: the plan against the brief, before the voiceover, the lyrics and the clip analysis the build waits on
  const violations = await checkPlan(plan, ctx, deps, assets, session?.treatment?.brief);
  // a fix round repairs a reel that was built already: how plain its arc is was settled then
  const fresh = violations.filter((v) => !(session?.refusedRules ?? []).includes(v.rule) && !(Array.isArray(args.keep) && v.rule === 'plain'));
  if (fresh.length) {
    updateDirectorSession(id, { refusedRules: [...new Set([...(session?.refusedRules ?? []), ...violations.map((v) => v.rule)])] });
    return { error: `The plan breaks ${violations.length === 1 ? 'a rule' : `${violations.length} rules`}; nothing was built. ${violations.map(violationText).join(' | ')}. Fix them and build again (a rule the footage cannot meet: build again as is and say so in your report).` };
  }
  // RS-1251: the user's narration (an audio file, or a video's sound)
  const voice = await resolveVoiceover(plan, assets, ctx, deps);
  if ('error' in voice) return voice;
  const { voiceover, note: voiceNote } = voice;
  // RS-1253: a lyric reel: the song's sung words (transcribed now if the song has none yet)
  const sung = await resolveLyrics(plan, plan.music ? assets.find((a) => a.id === plan.music) : undefined, ctx, deps);
  // M12: where the singer starts each phrase, from the song's transcript (made on import; a lyric reel's words otherwise)
  const vocalStarts = plan.music ? songVocalStarts(ctx.getDoc().assets?.find((a) => a.id === plan.music) ?? assets.find((a) => a.id === plan.music), sung.words) : [];
  // "#n" references from the numbered clip list
  const visual = directorVisuals(ctx);
  const badRefs: string[] = [];
  for (const sec of plan.sections) if (sec.clips) sec.clips = sec.clips.map((ref) => { const r = resolveClipRef(ref, visual); if (r === null) badRefs.push(ref); return r ?? ref; });
  if (badRefs.length) return { error: `no clip ${badRefs.join(', ')} (the list has #1-#${visual.length})` };
  const named = new Set(plan.sections.flatMap((s) => s.clips ?? []).map((ref) => ref.split('@')[0]!));
  const unknown = [...named].filter((x) => !assets.some((a) => a.id === x && VISUAL.has(a.kind)));
  if (unknown.length) return { error: `unknown clip assetIds: ${unknown.join(', ')} (use assetIds from reels_director_options media)` };
  // RS-1221: a line about something no clip shows is refused (the agent asks, or leaves that part out and says so)
  const missing = session?.treatment ? missingThings(session.treatment.story, session.clips).map((m) => m.word) : [];
  const faked = [...plan.sections.map((x) => x.text), ...(plan.overlays ?? []).map((o) => o.text)]
    .filter((t): t is string => !!t).filter((t) => missing.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t)));
  if (faked.length) return { error: `no clip shows what ${faked.map((t) => `"${t}"`).join(', ')} names: ask the user which clip shows it, or leave that line out and say so in your report` };
  const referenceId = session?.reference?.assetId;
  if (referenceId && named.has(referenceId)) return { error: 'the reference reel is not footage: cast the user\'s clips only' };
  const recipe = directorRecipe(plan);
  const values = defaultValues(recipe);
  values.media.clips = assets.filter((a) => VISUAL.has(a.kind) && a.id !== referenceId).map((a) => ({ assetId: a.id, kind: a.kind as 'video' | 'image' }));
  if (plan.music) values.media.music = [{ assetId: plan.music, kind: 'audio' }];
  let out;
  const tagsWarming = shotTagsWarming(id);
  if (tagsWarming) { ctx.onToolProgress?.('Reading what the shots show'); await tagsWarming; }
  try {
    out = await runRecipe({ ...deps.api, ...(deps.shotTags ? { shotTags: deps.shotTags(id) } : {}) }, {
      recipe, values, assets, fps: state.fps, replaceTimeline: true, plan, ...(voiceover ? { voiceover } : {}), ...(sung.words ? { lyrics: sung.words } : {}),
      ...(vocalStarts.length ? { vocalStarts } : {}),
      ...(typeof args.seed === 'number' && Number.isFinite(args.seed) ? { seed: Math.round(args.seed) } : {}),
      onProgress: ctx.onToolProgress,
    });
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  if (!out.action) return { error: out.messages.join('; ') || 'could not build the plan' };
  // the repairs first, once each (the assembler's own check repeats the section ones)
  out.messages = [...new Set([...repaired, ...out.messages])];
  if (voiceNote) out.messages.push(voiceNote);
  for (const v of violations) out.messages.unshift(`built although it breaks: ${violationText(v)}`);
  if (sung.note) out.messages.push(sung.note);
  const entries = out.result.report.lineEntries ?? [];
  const fits = out.result.report.actionFits ?? [];
  if (fits.length) out.messages.push(`${fits.length === 1 ? 'A start was' : `${fits.length} starts were`} moved so the movement finishes inside the shot: ${fits.map((f) => `section ${f.section} ${f.shiftSec > 0 ? '+' : ''}${f.shiftSec} s`).join(', ')}.`);
  if (entries.length) out.messages.push(`${entries.length === 1 ? 'A line comes' : `${entries.length} lines come`} in with the singer, after the cut: ${entries.map((e) => `section ${e.section} +${e.afterSec} s`).join(', ')}.`);
  out.messages.push(...await finishDirectorActions(out.action.actions, assets, deps.api, state.fps, ctx.onToolProgress));
  const report = out.result.report;
  const fps = state.fps;
  const spans = sectionSpans(out.action.actions, plan.sections.length, fps);
  const songAsset = plan.music ? assets.find((a) => a.id === plan.music) : undefined;
  const song = songAsset ? { seconds: songAsset.durationInFrames / fps, ...(await tempo(songAsset, deps)) } : undefined;
  const grid = songAsset ? await deps.api.musicGrid(songAsset).catch(() => null) : null;
  // RS-1224: the song bar by bar from where the reel starts it, for the pace check
  const startIdx = grid ? grid.beatTimesSec.findIndex((t) => t >= report.musicStartSec - 0.05) : -1;
  const map = grid && startIdx >= 0 ? songMap(grid.energyPerBeat, startIdx, grid.beatsPerBar, Math.ceil(report.totalFrames / fps / (60 / (song?.bpm ?? 120)) / grid.beatsPerBar) + 1) : null;
  const findings = reviewDirectorPlan({
    plan, spans, musicStartSec: report.musicStartSec, ...(song ? { song } : {}), ...(map ? { songMap: map } : {}),
    ...(report.eyeJumps?.length ? { eyeJumps: report.eyeJumps } : {}), ...(report.voices?.length ? { voices: report.voices } : {}),
  });
  // RS-1255: are the picks the best of the footage? Soft or dark stretches, and strong clips left out
  {
    const features = new Map<string, ClipFeatures>();
    visual.forEach((a, k) => { const f = session?.clips[k]?.features; if (f) features.set(a.id, f); });
    findings.push(...pickFindings({
      used: report.momentUse ?? [], features, fps, usedIds: new Set(report.usedAssetIds), clipCount: visual.length,
      label: (assetId) => `#${visual.findIndex((a) => a.id === assetId) + 1}`, isImage: (assetId) => visual.find((a) => a.id === assetId)?.kind === 'image',
    }));
  }
  // RS-1220: the reel with eyes closed, against the song's beat grid
  const beatFrames = (grid?.beatTimesSec ?? []).map((t) => Math.round((t - report.musicStartSec) * fps)).filter((f) => f >= 0 && f <= report.totalFrames + fps);
  const sound = soundCheck({
    actions: out.action.actions, fps, totalFrames: report.totalFrames, beatFrames,
    ...(grid?.dropSec !== undefined ? { dropFrame: Math.round((grid.dropSec - report.musicStartSec) * fps) } : {}),
  });
  const builds = (session?.lastBuild?.builds ?? 0) + 1;
  const record = {
    plan, spans, builds, clips: report.sectionClips ?? [], moments: report.sectionMoments ?? [], shotSec: report.shotSec ?? [], sound,
    // a fix round is saved with its number and defects (they go with the reel, RS-1222)
    ...(Array.isArray(args.keep) ? { fixes: typeof args.fixRound === 'number' ? args.fixRound : session?.lastBuild?.fixes ?? 0, defects: Array.isArray(args.defects) ? args.defects as Defect[] : session?.lastBuild?.defects ?? [] } : {}),
  };
  const next = updateDirectorSession(id, { fps, lastBuild: record });
  // RS-1222: the run goes with the reel, on its black canvas
  const actions = stampDirector(out.action.actions, savedDirector(next));
  commit(ctx, [...(added ? [{ type: 'addAsset', asset: added } as AtomicAction] : []), ...actions], 'Director: build reel');
  return {
    plan, spans, seconds: secs(report.totalFrames, fps), clipsUsed: report.usedAssetIds.length, notes: out.messages.slice(0, 12),
    ...(added ? { added } : {}), findings, lint: lintReel(ctx.getState()), builds,
  };
}

/**
 * RS-1267: the plan's violations of the brief and the plan rules (validatePlan), with the song's tempo and the numbered
 * clips of this project. Clip refs may be "#n" or assetIds.
 */
async function checkPlan(plan: ReelPlan, ctx: AgentContext, deps: ReelsDeps, assets: readonly MediaAsset[], brief: PlanBrief | undefined): Promise<PlanViolation[]> {
  const session = directorSession(projectId(ctx));
  const visual = directorVisuals(ctx);
  const fps = ctx.getState().fps;
  const song = plan.music ? assets.find((a) => a.id === plan.music) : undefined;
  const bpm = song ? (session?.song?.assetId === song.id && session.song.bpm) || (await tempo(song, deps)).bpm : undefined;
  // RS-1268: the beat grid for the phrase rule (none when the song has no steady beat)
  const grid = song && bpm ? await songGrid(song, deps).then((r) => r.grid).catch(() => null) : null;
  const songBeats = grid && grid.beatTimesSec.length >= 2 ? { beatTimesSec: grid.beatTimesSec, downbeatIndex: grid.downbeatIndex, ...(grid.beatsPerBar ? { beatsPerBar: grid.beatsPerBar } : {}), ...(grid.dropSec !== undefined ? { dropSec: grid.dropSec } : {}) } : undefined;
  const clips = visual.map((a, k) => {
    const log = session?.clips[k];
    const shape = log?.shape ?? (a.width && a.height ? (a.height > a.width ? 'portrait' as const : a.height < a.width ? 'landscape' as const : 'square' as const) : undefined);
    return { n: k + 1, seconds: log?.seconds ?? a.durationInFrames / fps, features: log?.features ?? null, ...(shape ? { shape } : {}), people: showsPeople(log) };
  });
  const clipNumber = (ref: string) => {
    const r = ref.trim();
    const m = /^#(\d+)/.exec(r);
    if (m) { const n = Number(m[1]); return n >= 1 && n <= visual.length ? n : undefined; }
    const k = visual.findIndex((a) => a.id === r.split('@')[0]);
    return k >= 0 ? k + 1 : undefined;
  };
  return validatePlan({ plan, ...(brief ? { brief } : {}), ...(bpm ? { bpm } : {}), clips, clipNumber, fps, ...(songBeats ? { songGrid: songBeats } : {}) });
}

/** Tags that mean people fill the shot, for the crop rule (a landscape view with a small figure in it is not one). */
const PEOPLE_TAGS = ['people', 'portrait', 'posing', 'laughing', 'celebrating'] as const;
/** The clip shows people: its shot tags say so, or (without tags) a face was found in it. */
function showsPeople(clip: { tags?: { scores: Record<string, number> }; features?: ClipFeatures | null } | undefined): boolean {
  if (clip?.tags) return PEOPLE_TAGS.some((t) => (clip.tags!.scores[t] ?? 0) >= 0.18);
  return !!clip?.features?.windows.some((w) => (w.face ?? 0) > 0.01);
}

/**
 * RS-1267 reels_validate_plan: the plan checked against the brief (the treatment's, or `brief`) and the plan rules
 * without building anything. The build runs the same check first, so this is for a plan the agent is unsure of.
 */
export async function validatePlanTool(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const parsed = parsePlan(args.plan);
  if (!parsed.ok) return { ok: false, problems: parsed.errors };
  const plan = parsed.plan;
  const problems: string[] = [];
  const repaired: string[] = [];
  adoptCustomGraphics(ctx.getState().items as never);
  resolvePlanSections(plan, repaired, problems);
  const assets = [...(ctx.getDoc().assets ?? []), ...(plan.music ? libraryMusic(ctx) : [])];
  if (plan.music) {
    const want = plan.music.toLowerCase();
    const hit = assets.find((a) => a.kind === 'audio' && (a.id.toLowerCase() === want || a.name.toLowerCase() === want));
    if (hit) plan.music = hit.id; else problems.push(`unknown music ${JSON.stringify(plan.music)}`);
  }
  const session = restoreDirectorSession(projectId(ctx), ctx.getState().items as never);
  const brief = parseBrief(args.brief) ?? session?.treatment?.brief;
  const violations = await checkPlan(plan, ctx, deps, assets, brief);
  const ok = !violations.length && !problems.length;
  return {
    ok, ...(brief ? { brief } : {}), violations, ...(problems.length ? { problems } : {}), ...(repaired.length ? { repaired: repaired.slice(0, 8) } : {}),
    next: ok ? 'The plan follows the brief and the rules: build it with reels_director_build.' : 'Fix the violations and problems in the plan, then build it (the build checks it again).',
  };
}

/** The critique of the last build (directorRepairTools), passed in by the dispatcher so the two modules do not import each other. */
export type CritiqueOfLastBuild = (ctx: AgentContext) => Promise<{ error: string } | { images: unknown[]; body: Record<string, unknown> }>;

export async function directorBuild(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps, critique?: CritiqueOfLastBuild): Promise<unknown> {
  const { keep: _internal, ...given } = args;
  const built = await runBuild(given, ctx, deps);
  if ('error' in built) return built;
  const { plan, spans, findings, lint, builds } = built;
  const fps = ctx.getState().fps;
  const session = directorSession(projectId(ctx));
  // RS-1258: the first build of a directed reel carries the critique itself (stage 4's frames, checks and checklist):
  // the agent always called reels_director_critique next without a thought, a model turn and a second frame render
  if (builds === 1 && session?.treatment && critique) {
    const looked = await critique(ctx);
    if (!('error' in looked)) {
      return {
        ...(looked.images.length ? { __images: looked.images } : {}),
        ok: true, ratio: plan.ratio, seconds: built.seconds, sections: plan.sections.length, clipsUsed: built.clipsUsed,
        ...(built.added ? { musicAdded: built.added.name } : {}), notes: built.notes,
        review: { findings, lint: { errors: lint.errors, warnings: lint.warnings, issues: lint.issues.slice(0, 8).map((x) => x.message) } },
        critique: looked.body,
        next: 'Stage 4 is here: these are the critique frames (no separate reels_director_critique call needed). Judge only the rendered frames and the findings, as a picky creative director seeing the reel cold, then name the three largest defects (section, at, evidence, fix) and call reels_director_fix with them and the changed sections only. If nothing is wrong, finish: review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report in at most three short lines (under 60 words in all; no list of sections, no times per part).'
          + songReportLine(ctx.getState()) + ' Do not call view_timeline_frames or reels_lint separately.',
      };
    }
  }
  // RS-1211: the review comes with the build: one frame per section, the lint, and the plan review
  // a frame 45% into each section (its start is often mid-transition or a flash)
  const frames = spans.map((s) => Math.round((s.from + (s.to - s.from) * 0.45) * fps));
  const sheet = framesAllowed(projectId(ctx)) ? await execFramesTool('view_timeline_frames', { frames }, ctx).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })) as { __images?: unknown[]; error?: unknown } | null : null;
  return {
    ...(sheet?.__images ? { __images: sheet.__images } : {}),
    ok: true, ratio: plan.ratio, seconds: built.seconds, sections: plan.sections.length, clipsUsed: built.clipsUsed,
    ...(built.added ? { musicAdded: built.added.name } : {}), notes: built.notes,
    review: {
      frames: sheet?.__images ? spans.map((s, i) => `image ${i + 1}: section ${i} (${plan.sections[i]!.move}) at ${(s.from + (s.to - s.from) * 0.45).toFixed(1)} s`)
        : typeof sheet?.error === 'string' ? `frames did not render: ${sheet.error.slice(0, 400)}. Fix the section that uses that file; do not call view_timeline_frames.` : 'frames unavailable',
      findings,
      lint: { errors: lint.errors, warnings: lint.warnings, issues: lint.issues.slice(0, 8).map((x) => x.message) },
    },
    // an external agent's build is a draft until review_edit_session applies it; a bare "report" made it skip that
    // RS-1214: a director run's first build goes to the critique stage before any change
    next: (builds === 1 && session?.treatment
      ? 'Stage 4: call reels_director_critique now (it looks closer than these frames). Do not rebuild before it.'
      : session?.treatment
        ? 'Check these frames; for anything still wrong, use reels_director_fix on those sections (the rest stays as it is), otherwise finish.'
      : findings.length || lint.errors
        ? 'Fix the review findings and anything clearly wrong in the frames with ONE rebuild (replaceTimeline true), then finish.'
        : 'Check the frames; if nothing is clearly wrong, finish.')
      + ' To finish: call review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report in at most three short lines (under 60 words in all; no list of sections, no times per part).'
      + songReportLine(ctx.getState()) + ' Do not call view_timeline_frames or reels_lint separately.',
  };
}

/** Ids the slice may carry: every move of the arc and a capped kit, so the result stays far under the 16k cap. */
const SLICE_CAP = { style: 4, transition: 5, effect: 6, graphic: 5 } as const;

/**
 * RS-1214 stage 2: the agent's treatment, checked against the shot log, the song and its own tone; returns the full
 * catalogue entries (params, clip counts) for the kit it chose and how to write the plan. `lookup` alone returns entries
 * for any ids (a later change that needs a style or move the treatment did not pick).
 */
export function directorTreatment(args: Record<string, unknown>, ctx: AgentContext): unknown {
  const lookup = Array.isArray(args.lookup) ? args.lookup.filter((x): x is string => typeof x === 'string') : [];
  if (lookup.length && !args.parts) {
    const known = lookup.filter((id) => catalogKind(id));
    return { catalog: catalogSlice(known.slice(0, 24)), ...(known.length < lookup.length ? { unknown: lookup.filter((id) => !catalogKind(id)) } : {}) };
  }
  const parsed = parseTreatment(args);
  if (!parsed.ok) return { error: `The treatment is incomplete: ${parsed.errors.join('; ')}` };
  const t = parsed.treatment;
  const id = projectId(ctx);
  const session = directorSession(id);
  const findings = checkTreatment(t, {
    clips: session?.clips ?? [], fps: session?.fps ?? ctx.getState().fps, ...(session?.song ? { song: session.song } : {}),
    ...(session?.reference?.profile ? { reference: session.reference.profile } : {}),
    ...(session?.brand ? { brand: { name: session.brand.name, words: brandWords(session.brand), ...(brandAction(session.brand) ? { action: brandAction(session.brand) } : {}) } } : {}),
    ...(session?.clips.some((c) => c.filmedAt) ? { clock: true } : {}),
  });
  const gated = session?.askFirst === true;
  updateDirectorSession(id, { treatment: t, lastBuild: undefined, refusedRules: undefined, ...(gated ? { gate: 'waiting' as const } : {}) });
  const count: Record<string, number> = {};
  const ids = treatmentIds(t).filter((x) => {
    const kind = catalogKind(x);
    if (!kind) return false;
    count[kind] = (count[kind] ?? 0) + 1;
    return kind === 'move' || kind === 'look' || count[kind]! <= (SLICE_CAP[kind as keyof typeof SLICE_CAP] ?? 4);
  });
  // RS-1221: what only the user can answer stops the run before the plan
  const questions = findings.flatMap((f) => (f.ask ? [f.ask] : []));
  return {
    ok: true,
    concept: t.concepts[t.chosen]?.name,
    tone: t.tone,
    findings,
    ...(questions.length ? { questions } : {}),
    motion: motionRuleText(t.tone),
    catalog: catalogSlice(ids),
    planBrief: PLAN_BRIEF,
    ...(gated ? { card: treatmentCard(t, session?.song?.bpm) } : {}),
    next: gated
      ? `The user approves before anything is built. ${findings.length ? 'First send a revised treatment that fixes the findings (and asks any questions in the same message). Then show' : 'Show'} the user \`card\` exactly as written and ask "Build it, or change something?"; then stop and wait. When they say go, write the plan and call reels_director_build with approvedBy set to their words. When they ask for changes, send a revised treatment and show its card again.`
      : questions.length
      ? 'Ask the user these questions in one short message and wait for the answer; or, if the reel works without that part, leave its line out and say so in your report. The build refuses a line that names it.'
      : findings.length
        ? 'Fix every finding as you write the plan (no need to send the treatment again unless the concept changes), then call reels_director_build.'
        : 'Write the plan from this treatment and call reels_director_build.',
  };
}
