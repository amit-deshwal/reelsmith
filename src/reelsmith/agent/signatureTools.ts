// reels_apply_signature: one undo step that gives the reel one considered style (see ../signatures.ts).
import type { AgentContext } from '../../agent/context';
import { planSignature, SIGNATURES, signatureById } from '../signatures';
import { commit } from './reelsTools';

export function applySignatureTool(args: Record<string, unknown>, ctx: AgentContext): unknown {
  const name = typeof args.signature === 'string' ? args.signature.trim() : '';
  const sig = signatureById(name);
  if (!sig) return { error: `unknown signature ${JSON.stringify(name)}; use one of: ${SIGNATURES.map((s) => s.id).join(', ')}` };
  const state = ctx.getState();
  const plan = planSignature(state, sig, args.transitions !== false);
  if (!plan.clips) return { error: 'There are no video or photo clips on the timeline.' };
  commit(ctx, plan.actions, plan.label);
  return {
    ok: true, signature: sig.id, look: sig.look, clips: plan.clips, hook: sig.hook?.assetId.replace('builtin:', '') ?? null,
    transition: plan.cuts ? sig.transition : null, cutsWithTransition: plan.cuts,
    next: 'Run reels_lint, then tell the user the style in one line. Do not add more effects on top.',
  };
}
