// RS-1233: the same directed reel in another shape, as its own timeline next to the first. The saved treatment and plan
// are built again for the new canvas with every section's clips and source moments kept, so the story, the cut and the
// beats stay the same while the text, graphics, crops and safe area are laid out for that shape (not a crop of the
// first one).
import type { AgentContext } from '../../agent/context';
import { execFramesTool } from '../../agent/tools/frames-tool';
import { RATIO_IDS, RATIO_SIZES, type RatioId } from '../../../shared/reelsmith/ratios';
import { framesAllowed } from '../framePrivacy';
import { restoreDirectorSession } from '../director/directorSession';
import { runBuild } from './directorTools';
import { projectId, type ReelsDeps } from './reelsTools';

export async function directorReshape(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const ratio = String(args.ratio ?? '') as RatioId;
  if (!RATIO_IDS.includes(ratio)) return { error: `ratio must be one of ${RATIO_IDS.join(', ')}` };
  const id = projectId(ctx);
  const session = restoreDirectorSession(id, ctx.getState().items as never);
  const built = session?.lastBuild;
  if (!session || !built) return { error: 'There is no director reel on this timeline to reshape (switch to the directed reel, or build one with reels_director_build).' };
  if (built.plan.ratio === ratio) return { error: `This reel is already ${ratio}.` };
  if (!ctx.commands.createTimeline) return { error: 'New timelines cannot be made here.' };
  const doc = ctx.getDoc();
  const from = doc.timelines.find((t) => t.id === doc.activeTimelineId);
  ctx.onToolProgress?.(`Making the ${ratio} version`);
  ctx.commands.createTimeline({ name: `${from?.name ?? 'Reel'} ${ratio}`, ...RATIO_SIZES[ratio], activate: true });
  const { keep: _replayed, ...plan } = built.plan;
  const keep = plan.sections.map((_, k) => (built.clips?.[k] ? { clips: built.clips[k]!, moments: built.moments?.[k] ?? [] } : null));
  const out = await runBuild({ plan: { ...plan, ratio }, keep, replaceTimeline: true }, ctx, deps);
  if ('error' in out) return out;
  const fps = ctx.getState().fps;
  const frames = out.spans.map((s) => Math.round((s.from + (s.to - s.from) * 0.45) * fps));
  const sheet = framesAllowed(id) ? await execFramesTool('view_timeline_frames', { frames }, ctx).catch(() => null) as { __images?: unknown[] } | null : null;
  return {
    ...(sheet?.__images ? { __images: sheet.__images } : {}),
    ok: true, ratio, timeline: `${from?.name ?? 'Reel'} ${ratio} (new, now open; the ${built.plan.ratio} reel is unchanged)`,
    seconds: out.seconds, sections: out.spans.length,
    frames: sheet?.__images ? out.spans.map((s, i) => `image ${i + 1}: section ${i} at ${(s.from + (s.to - s.from) * 0.45).toFixed(1)} s`) : 'frames unavailable',
    review: out.findings, lint: { errors: out.lint.errors, warnings: out.lint.warnings, issues: out.lint.issues.slice(0, 8).map((x) => x.message) },
    next: 'Judge these frames for this shape: text readable and inside the safe area, no face cut off, nothing crowded. Fix what is wrong with reels_director_fix on this timeline (it only changes this version), then finish: review_edit_session if you opened an edit session, then one line to the user.',
  };
}
