// RS-1273 (1): the clips a build left out, each with a reason, so the agent can say it (or cast them) instead of
// dropping a third of the user's footage in silence (34 of 48 Goa clips used after "include my missing videos").
import { groupNearDuplicates, type ClipFeatures } from '../assembler/scoring';
import { SOFT, UNSEEN_EXPOSURE } from './pickAudit';

export type UnusedWhy = 'short' | 'dark' | 'soft' | 'duplicate' | 'not picked';
export interface UnusedClipsInput {
  /** the director's numbered clips, in order (#1 is index 0) */
  clips: ReadonlyArray<{ id: string; name: string; kind: 'video' | 'image'; seconds: number }>;
  usedIds: ReadonlySet<string>;
  features: ReadonlyMap<string, ClipFeatures>;
}
export interface UnusedClips { count: number; total: number; clips: string[]; why: Partial<Record<UnusedWhy, number>> }

export function unusedClips(r: UnusedClipsInput): UnusedClips {
  const used = r.clips.filter((c) => r.usedIds.has(c.id));
  const groups = groupNearDuplicates([...r.features.values()]);
  const usedGroups = new Set(used.flatMap((c) => (groups.has(c.id) ? [groups.get(c.id)!] : [])));
  const why: UnusedClips['why'] = {};
  const clips: string[] = [];
  r.clips.forEach((c, k) => {
    if (r.usedIds.has(c.id)) return;
    const ws = r.features.get(c.id)?.windows ?? [];
    const reason: UnusedWhy = c.kind === 'video' && c.seconds < 1 ? 'short'
      : ws.length && ws.every((w) => w.exposure < UNSEEN_EXPOSURE) ? 'dark'
        : ws.length && Math.max(...ws.map((w) => w.sharpness)) < SOFT ? 'soft'
          : groups.has(c.id) && usedGroups.has(groups.get(c.id)!) ? 'duplicate'
            : 'not picked';
    why[reason] = (why[reason] ?? 0) + 1;
    clips.push(`#${k + 1} ${c.name} (${reason === 'duplicate' ? 'a near-duplicate of a clip in the reel' : reason === 'short' ? 'under a second' : reason === 'dark' ? 'too dark or blown out throughout' : reason === 'soft' ? 'out of focus throughout' : 'fits, not picked'})`);
  });
  return { count: clips.length, total: r.clips.length, clips, why };
}

/** The note for the build result: what was left out and how to bring it in. */
export function unusedClipsNote(u: UnusedClips): string | undefined {
  if (!u.count) return undefined;
  const fit = u.why['not picked'] ?? 0;
  return `${u.count} of ${u.total} clips are not in the reel${fit ? ` (${fit} of them usable)` : ''}. When the user asked for all their clips, or names one of these, cast them: add flash-cuts or zoom-punch sections (several clips each), or set brief.useAll and rebuild; say which ones you left out and why in the report.`;
}
