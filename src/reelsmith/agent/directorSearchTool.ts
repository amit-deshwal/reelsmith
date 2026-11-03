// reels_find_shots (RS-1256): "which clips show this?" answered by the visual model instead of by squinting at sheets.
// Each line of the story (or each part of the treatment) becomes a vector; the nearest frames of the numbered clips come
// back as ready-to-use "#n@seconds" references. Read-only: it changes nothing on the timeline.
import type { AgentContext } from '../../agent/context';
import { searchMoments, showsOf, type FrameVector } from '../director/shotSearch';
import { directorVisuals } from './directorTools';
import { projectId, type ReelsDeps } from './reelsTools';

const MAX_QUERIES = 8;
const MAX_QUERY_CHARS = 120;

export async function findShots(args: Record<string, unknown>, ctx: AgentContext, deps: ReelsDeps): Promise<unknown> {
  const raw = Array.isArray(args.queries) ? args.queries : typeof args.query === 'string' ? [args.query] : [];
  const queries = raw.filter((q): q is string => typeof q === 'string').map((q) => q.trim()).filter(Boolean).slice(0, MAX_QUERIES);
  if (!queries.length) return { error: 'queries is required: one to eight short phrases describing what a shot should show, e.g. ["climbing a rock face", "friends laughing at camp"]' };
  if (!deps.semantic) return { error: 'The visual model is not available here. Pick from the shot log and the contact sheets.' };
  const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.max(1, Math.min(8, Math.round(args.limit))) : 4;
  const visual = directorVisuals(ctx);
  if (!visual.length) return { error: 'No clips are imported yet.' };
  const found = await deps.semantic(projectId(ctx), visual, queries.map((q) => q.slice(0, MAX_QUERY_CHARS))).catch(() => null);
  if (!found || !found.frames.length) {
    return { error: 'The visual model is not installed or has not read these clips yet (Settings, model packs). Pick from the shot log and the contact sheets.' };
  }
  const number = new Map(visual.map((a, i) => [a.id, i + 1]));
  const allowed = new Set(visual.map((a) => a.id));
  const frames: FrameVector[] = found.frames;
  const covered = new Set(frames.map((f) => f.assetId)).size;
  return {
    results: queries.map((query, i) => {
      const vector = found.queries[i];
      const hits = vector ? searchMoments(frames, vector, { limit, allowed }) : [];
      return {
        query,
        shots: hits.map((h) => ({ ref: `#${number.get(h.assetId)}@${h.atSec}`, shows: showsOf(h.match), match: h.match })),
        ...(hits.length && showsOf(hits[0]!.match) === 'weak' ? { none: 'nothing in the footage shows this: leave it out, show it with a graphic, or ask the user which clip does' } : {}),
      };
    }),
    clipsRead: `${covered} of ${visual.length}`,
    note: 'shows: sure = the frame clearly shows it; maybe = close, check the contact sheet cell before using it; weak = it does not. Use "ref" as it is in a section\'s clips. One result per clip, so the results are different shots.',
  };
}
