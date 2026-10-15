// RS-106: validate an agent's `propose_selection` answer before the assembler uses it.
import type { AssemblyClip } from './types';

export interface SelectionProposal { assetIds: unknown; rationale?: unknown }
export interface SelectionCheck {
  accepted: string[];
  rejected: Array<{ value: unknown; reason: string }>;
  ok: boolean;
}

/** Keep only known, non-repeated, non-duplicate-group ids, at most `slots` of them. Never throws. */
export function validateSelection(proposal: SelectionProposal, clips: AssemblyClip[], slots: number): SelectionCheck {
  const rejected: SelectionCheck['rejected'] = [];
  if (!Array.isArray(proposal?.assetIds)) {
    return { accepted: [], rejected: [{ value: proposal?.assetIds, reason: 'assetIds must be an array' }], ok: false };
  }
  const byId = new Map(clips.map((c) => [c.assetId, c]));
  const seen = new Set<string>();
  const groups = new Set<string>();
  const accepted: string[] = [];
  for (const raw of proposal.assetIds) {
    if (typeof raw !== 'string') { rejected.push({ value: raw, reason: 'not a string' }); continue; }
    const clip = byId.get(raw);
    if (!clip) { rejected.push({ value: raw, reason: 'unknown asset' }); continue; }
    if (seen.has(raw)) { rejected.push({ value: raw, reason: 'repeated' }); continue; }
    if (clip.groupId && groups.has(clip.groupId)) { rejected.push({ value: raw, reason: 'near-duplicate of a chosen clip' }); continue; }
    if (accepted.length >= slots) { rejected.push({ value: raw, reason: 'more picks than slots' }); continue; }
    seen.add(raw);
    if (clip.groupId) groups.add(clip.groupId);
    accepted.push(raw);
  }
  return { accepted, rejected, ok: rejected.length === 0 };
}
