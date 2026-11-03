// Director stage 4 (RS-1214, RS-1216): the critique looks closer at the built reel and asks for the three largest
// defects; the fix repairs them in place, rebuilding only the sections they name while every other section comes back
// with the same clips and moments. The fix is also how a later chat edits a director reel (RS-1222): with no changes
// it returns the treatment and plan saved with the reel.
import type { AgentContext } from '../../agent/context';
import { execFramesTool } from '../../agent/tools/frames-tool';
import { framesAllowed } from '../framePrivacy';
import { lintReel } from '../reelLint';
import { critiqueFrames, critiquePlan, criticBrief, parseDefects } from '../director/critique';
import { directorSession, restoreDirectorSession, updateDirectorSession } from '../director/directorSession';
import { checkAgainstReference } from '../director/reference';
import type { Treatment } from '../director/treatment';
import { runBuild } from './directorTools';
import { songReportLine } from '../exportMusic';
import { projectId, type ReelsDeps } from './reelsTools';

/** Frames the frame tool renders in one call (one contact sheet each). */
const FRAMES_PER_SHEET = 8;

/**
 * Render frames in sheets of eight, labelled for the agent ("image 2: [1] 4.5s s1 hold mid · ..."). RS-1258: the sheets
 * render at once (each in a few tabs on the server): 18 critique frames took 12.6 s one sheet after another, ~5 s now.
 */
export async function frameSheets(picks: Array<{ frame: number; label: string }>, fps: number, ctx: AgentContext, render: (frames: number[]) => Promise<unknown> = (frames) => execFramesTool('view_timeline_frames', { frames }, ctx)): Promise<{ images: unknown[]; sheets: string[] }> {
  const images: unknown[] = [];
  const sheets: string[] = [];
  if (!framesAllowed(projectId(ctx))) return { images, sheets };
  const chunks: Array<typeof picks> = [];
  for (let i = 0; i < picks.length; i += FRAMES_PER_SHEET) chunks.push(picks.slice(i, i + FRAMES_PER_SHEET));
  ctx.onToolProgress?.(`Looking closer (${picks.length} frames)`);
  const rendered = await Promise.all(chunks.map((chunk) => render(chunk.map((p) => p.frame)).catch(() => null) as Promise<{ __images?: unknown[] } | null>));
  rendered.forEach((out, i) => {
    if (!out?.__images?.length) return;
    images.push(...out.__images);
    sheets.push(`image ${images.length}: ${chunks[i]!.map((p, j) => `[${j + 1}] ${(p.frame / fps).toFixed(1)}s ${p.label}`).join(' · ')}`);
  });
  return { images, sheets };
}

/** The checks that need no frames, on the last build: the plan against the treatment, the sound, the reference. */
function buildChecks(session: NonNullable<ReturnType<typeof directorSession>>) {
  const built = session.lastBuild!;
  const ref = session.reference?.profile;
  return {
    findings: critiquePlan(built.plan, built.spans, session.treatment),
    soundFindings: built.sound ?? [],
    ...(ref ? {
      referenceFindings: checkAgainstReference(ref, { shotSec: built.shotSec ?? [], ...(built.plan.look ? { look: built.plan.look } : {}), sectionLooks: built.plan.sections.flatMap((x) => (x.look ? [x.look] : [])) }),
    } : {}),
  };
}

/** The treatment in brief, as the critique and the fix hand it back. */
const treatmentBrief = (t?: Treatment) => (t ? {
  // (a key named "signature" is redacted as a secret on its way to an external agent: runtime-artifact.ts SIGNED_QUERY)
  tone: t.tone, signatureMoment: t.signature, concept: t.concepts[t.chosen]?.name,
  ...(t.styleGuide ? { styleGuide: t.styleGuide } : {}),
} : undefined);

/**
 * RS-1214 stage 4: a closer look at the built reel (about three frames a section and every line at its fullest, in
 * sheets of eight) with the critic's checklist and the checks frames cannot show. RS-1216: it asks for the three
 * largest defects, which reels_director_fix repairs section by section.
 */
export async function directorCritique(ctx: AgentContext): Promise<unknown> {
  const critique = await critiqueOfLastBuild(ctx);
  if ('error' in critique) return critique;
  const { images, body } = critique;
  return {
    ...(images.length ? { __images: images } : {}),
    ...body,
    next: `Name the three largest defects (section, at, evidence, fix) and call reels_director_fix with them and the changed sections only; every other section comes back exactly as it is. If nothing is wrong, ${FINISH}` + songReportLine(ctx.getState()),
  };
}

/** How every director stage that can end the run says to end it (RS-1258: the report was 1-4k characters, 7-20 s). */
export const FINISH = 'finish: review_edit_session if you opened an edit session (nothing reaches the timeline until it returns applied), then report in at most three short lines (under 60 words: the concept and structure, the length and song, two things they could ask next).';

/**
 * The critique of the last build: about three frames a section and each line at its fullest, the checks frames cannot
 * show and the critic's checklist. RS-1258: the first build of a run returns it itself (the agent always called the
 * critique next without a thought: 2-5 s of model time and a second render of frames).
 */
export async function critiqueOfLastBuild(ctx: AgentContext): Promise<{ error: string } | { images: unknown[]; body: Record<string, unknown> }> {
  const id = projectId(ctx);
  const session = restoreDirectorSession(id, ctx.getState().items as never);
  const built = session?.lastBuild;
  if (!session || !built) return { error: 'Nothing to critique yet: build the reel with reels_director_build first (the critique reads the last director build).' };
  const fps = ctx.getState().fps;
  const { images, sheets } = await frameSheets(critiqueFrames(built.plan, built.spans, fps), fps, ctx);
  updateDirectorSession(id, { lastBuild: { ...built, fixes: 0, defects: [] } });
  const lint = lintReel(ctx.getState());
  const brief = treatmentBrief(session.treatment);
  return {
    images,
    body: {
      frames: images.length ? sheets : 'frames unavailable: judge from the plan and the checks',
      sections: built.spans.map((sp, k) => `s${k} ${built.plan.sections[k]!.move} ${sp.from.toFixed(1)}-${sp.to.toFixed(1)} s`),
      ...buildChecks(session),
      textWarnings: lint.issues.slice(0, 8).map((x) => x.message),
      ...(brief ? { treatment: brief } : {}),
      checklist: criticBrief(session.treatment),
    },
  };
}

/** Fix rounds after a critique; then the run finishes and says what is left. */
const MAX_FIX_ROUNDS = 3;

/** Plan fields a fix may change besides sections. */
const PLAN_FIELDS = ['look', 'sfx', 'musicStart', 'overlays', 'graphics', 'tone'] as const;

/**
 * RS-1216: repair named defects in place. The changed sections are rebuilt; every other one comes back with the same
 * clips and the same moments (the plan's `keep`), and only the changed sections are shown again. With no changes it
 * returns the saved treatment and plan (RS-1222), so a later chat edit starts from the director's intent.
 */
export async function directorFix(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const id = projectId(ctx);
  const session = restoreDirectorSession(id, ctx.getState().items as never);
  const built = session?.lastBuild;
  if (!session || !built) return { error: 'There is no director reel to fix: the timeline has no director build (build one with reels_director_build).' };
  const n = built.plan.sections.length;
  const raw = (args.sections && typeof args.sections === 'object' && !Array.isArray(args.sections) ? args.sections : {}) as Record<string, unknown>;
  const top = (args.plan && typeof args.plan === 'object' ? args.plan : {}) as Record<string, unknown>;
  const changes = Object.keys(raw).length + PLAN_FIELDS.filter((k) => k in top).length;
  if (!changes) {
    return {
      ...(session.treatment ? { treatment: { ...treatmentBrief(session.treatment), story: session.treatment.story, parts: session.treatment.parts } } : {}),
      plan: built.plan,
      sections: built.spans.map((sp, k) => `s${k} ${built.plan.sections[k]!.move} ${sp.from.toFixed(1)}-${sp.to.toFixed(1)} s`),
      ...(built.defects?.length ? { openDefects: built.defects } : {}),
      next: 'This is the reel as directed. To change it, call reels_director_fix again with `sections` ({ "<index>": the whole new section }) and/or `plan` (look, sfx, musicStart, overlays, graphics, tone), plus `request` (the user\'s words) or `defects`. Keep the treatment\'s tone and kit unless the user asks for a new feel.',
    };
  }
  const rounds = (built.fixes ?? 0) + 1;
  if (args.defects === undefined && typeof args.request !== 'string') return { error: 'Say why: `defects` (from the critique: section, at, evidence, fix) or `request` (the user\'s words for this change).' };
  let defects: ReturnType<typeof parseDefects> | undefined;
  if (args.defects !== undefined) {
    defects = parseDefects(args.defects, n, built.spans);
    if (!defects.ok) return { error: `The defects are incomplete: ${defects.errors.join('; ')}` };
  }
  const changed = new Set<number>();
  const sections = built.plan.sections.map((s) => ({ ...s }));
  for (const [key, section] of Object.entries(raw)) {
    const k = Number(key);
    if (!Number.isInteger(k) || k < 0 || k >= n) return { error: `sections: "${key}" is not a section index (0-${n - 1}); to add or remove sections, rebuild with reels_director_build` };
    if (!section || typeof section !== 'object') return { error: `sections["${key}"]: give the whole new section` };
    sections[k] = section as never;
    changed.add(k);
  }
  // a change to a line or graphic across sections shows in every section it touches; a reel-wide change in all of them
  for (const field of ['overlays', 'graphics'] as const) {
    if (!(field in top) || !Array.isArray(top[field])) continue;
    const key = (x: unknown) => JSON.stringify(x);
    const before = (built.plan[field] ?? []) as Array<{ from?: number; to?: number }>;
    const after = top[field] as Array<{ from?: number; to?: number }>;
    const was = new Set(before.map(key)), is = new Set(after.map(key));
    for (const x of [...before.filter((b) => !is.has(key(b))), ...after.filter((a) => !was.has(key(a)))]) {
      for (let k = Number(x.from ?? 0); k <= Number(x.to ?? x.from ?? 0) && k < n; k += 1) changed.add(k);
    }
  }
  if (['look', 'musicStart', 'tone', 'sfx'].some((f) => f in top)) for (let k = 0; k < n; k += 1) changed.add(k);
  const { keep: _replayed, ...last } = built.plan;
  const plan = { ...last, ...Object.fromEntries(PLAN_FIELDS.filter((k) => k in top).map((k) => [k, top[k]])), sections };
  // a section rebuilt with new beats moves the ones after it; they keep their shots
  const keep = sections.map((_, k) => (changed.has(k) || !built.clips?.[k] ? null : { clips: built.clips[k]!, moments: built.moments?.[k] ?? [] }));
  ctx.onToolProgress?.(`Fixing section${changed.size === 1 ? '' : 's'} ${[...changed].join(', ')}`);
  const out = await runBuild({ plan, keep, replaceTimeline: true, fixRound: rounds, defects: defects?.ok ? defects.defects : [] }, ctx, deps);
  if ('error' in out) return out;
  const fps = ctx.getState().fps;
  const picks = critiqueFrames(out.plan, out.spans, fps).filter((p) => [...changed].some((k) => p.label.startsWith(`s${k} `) || (p.frame >= out.spans[k]!.from * fps && p.frame < out.spans[k]!.to * fps)));
  const { images, sheets } = await frameSheets(picks, fps, ctx);
  const last1 = rounds >= MAX_FIX_ROUNDS;
  return {
    ...(images.length ? { __images: images } : {}),
    ok: true, round: `${rounds} of ${MAX_FIX_ROUNDS}`, rebuilt: [...changed].sort((a, b) => a - b), seconds: out.seconds,
    frames: images.length ? sheets : 'frames unavailable',
    ...(defects?.ok ? { defects: defects.defects } : {}),
    ...buildChecks(directorSession(id)!),
    review: out.findings, notes: out.notes,
    next: (last1
      ? 'That was the last fix round: finish, and say in one line what still looks off, if anything.'
      : 'Judge only these frames: is each defect gone, and is nothing new broken? If so, finish. If not, name what remains (up to three, worst first) and call reels_director_fix again.')
      + ` To ${FINISH}` + songReportLine(ctx.getState()),
  };
}
