// reels_apply_look: one undo step that puts a reel look (see ../looks.ts) on every clip, or just the selected one.
import type { AgentContext } from '../../agent/context';
import { lookById, planLook, REEL_LOOKS } from '../looks';
import { commit } from './reelsTools';

export function applyLookTool(args: Record<string, unknown>, ctx: AgentContext): unknown {
  const name = typeof args.look === 'string' ? args.look.trim() : '';
  const look = name === 'none' ? null : lookById(name);
  if (name !== 'none' && !look) return { error: `unknown look ${JSON.stringify(name)}; use one of: ${REEL_LOOKS.map((l) => l.id).join(', ')}, none` };
  const state = ctx.getState();
  const selected = args.scope === 'selected';
  if (selected && !state.selectedId) return { error: 'No clip is selected. Select a clip, or use scope "all".' };
  const plan = planLook(state.items, look ?? null, selected ? [state.selectedId!] : undefined);
  if (!plan.clips) return { error: selected ? 'The selected item is not a video or photo clip.' : 'There are no video or photo clips on the timeline.' };
  commit(ctx, plan.actions, plan.label);
  return {
    ok: true, look: look?.id ?? 'none', clips: plan.clips,
    effects: look?.steps.map((step) => step.assetId.replace('builtin:', '')) ?? [],
    next: 'Effects added by a look stay editable (manage_effects). Run reels_lint if you changed anything else, then tell the user which look and on how many clips.',
  };
}
