// RS-1219: one rule set per tone for how things move, so a reel feels made by one hand. Every text style, graphic, push
// and transition used to pick its own timing: a royal reel had a gold title gliding in next to a sticker that bounced
// and a transition that snapped. Small controls may snap, big things settle, the camera barely moves, a headline lands
// and holds; and if everything overshoots, nothing reads as precise. The compiler applies the tone's rules to what the
// plan built (applyMotionRules), except where the plan set a value itself.
import type { AtomicAction } from '../../editor/reducerActions';
import type { PlanValue, Tone } from '../../../shared/reelsmith/directorPlan';

export interface MotionRule {
  /** text entrances: > 1 slower (glides), < 1 faster (snaps) */
  textPace: number;
  /** overshoot of text that pops or slams: 0 lands dead on, 1 the style's own bounce */
  textOvershoot: number;
  /** overshoot of drawn graphics (pins, stickers, bubbles) */
  graphicOvershoot: number;
  /** the slow push of a held shot, against the move's default */
  push: number;
  /** transition length, against its catalogue length */
  transition: number;
  /** RS-1245: plain cuts punch in this much (scale 1 + punch, settling in ~0.3 s) and drift in half as much over the shot */
  cutPunch: number;
}

export const MOTION_RULES: Record<Tone, MotionRule> = {
  royal: { textPace: 1.25, textOvershoot: 0.2, graphicOvershoot: 0.4, push: 0.7, transition: 1.3, cutPunch: 0 },
  epic: { textPace: 1, textOvershoot: 0.5, graphicOvershoot: 0.7, push: 1.2, transition: 1, cutPunch: 0.06 },
  hype: { textPace: 0.75, textOvershoot: 1, graphicOvershoot: 1, push: 1.4, transition: 0.8, cutPunch: 0.12 },
  playful: { textPace: 0.9, textOvershoot: 1.2, graphicOvershoot: 1.2, push: 1, transition: 0.9, cutPunch: 0.08 },
  funny: { textPace: 0.85, textOvershoot: 1.3, graphicOvershoot: 1.3, push: 1, transition: 0.85, cutPunch: 0.08 },
  emotional: { textPace: 1.3, textOvershoot: 0, graphicOvershoot: 0.3, push: 0.6, transition: 1.4, cutPunch: 0 },
  calm: { textPace: 1.35, textOvershoot: 0, graphicOvershoot: 0.3, push: 0.5, transition: 1.5, cutPunch: 0 },
  nostalgic: { textPace: 1.2, textOvershoot: 0.2, graphicOvershoot: 0.5, push: 0.6, transition: 1.3, cutPunch: 0 },
  romantic: { textPace: 1.3, textOvershoot: 0.1, graphicOvershoot: 0.4, push: 0.6, transition: 1.4, cutPunch: 0 },
  moody: { textPace: 1.15, textOvershoot: 0, graphicOvershoot: 0.3, push: 0.8, transition: 1.2, cutPunch: 0.03 },
};

/** The rules in words, for the treatment result (the agent writes the plan knowing what the compiler will do). */
export function motionRuleText(tone: Tone): string {
  const r = MOTION_RULES[tone];
  const pace = r.textPace > 1.1 ? 'glide in slowly and hold' : r.textPace < 0.95 ? 'snap in fast' : 'come in at their own pace';
  const bounce = r.textOvershoot <= 0.2 ? 'land without a bounce' : r.textOvershoot >= 1.1 ? 'bounce a lot' : 'bounce a little';
  return `${tone} motion (applied by the build): lines ${pace} and ${bounce}; graphics overshoot x${r.graphicOvershoot}; held shots push x${r.push}; transitions run x${r.transition} their length${r.cutPunch ? `; plain cuts punch in ${Math.round(r.cutPunch * 100)}% and drift` : ''}. A hold's own push param overrides its rule.`;
}

type Add = Extract<AtomicAction, { type: 'add' }>;
const isAdd = (a: AtomicAction): a is Add => a.type === 'add';

/** A move's params with the tone applied, unless the plan set them itself: a held shot pushes as the tone moves (RS-1219);
 * a plain cut punches in and drifts (RS-1245). */
export function toneParams(rule: MotionRule | undefined, moveId: string, given: Record<string, PlanValue> | undefined, params: Record<string, PlanValue>): Record<string, PlanValue> {
  if (!rule) return params;
  if (moveId === 'hold' && given?.push === undefined && typeof params.push === 'number') return { ...params, push: params.push * rule.push };
  if (moveId === 'cut' && given?.punch === undefined && rule.cutPunch > 0) return { ...params, punch: rule.cutPunch };
  return params;
}

/**
 * Text and graphics in the built actions take the tone's timing: text entrances and staggers scale by textPace (never
 * past 40% of the line's time on screen) and pops by textOvershoot; graphics by graphicOvershoot.
 */
export function applyMotionRules(actions: AtomicAction[], tone: Tone, fps: number): AtomicAction[] {
  const r = MOTION_RULES[tone];
  return actions.map((a) => {
    if (!isAdd(a) || a.item.kind !== 'motion-graphic') return a;
    const props = (a.item as { props?: Record<string, unknown> }).props ?? {};
    if (typeof props.rsGraphic === 'string') return { ...a, item: { ...a.item, props: { ...props, overshoot: r.graphicOvershoot } } } as AtomicAction;
    if (typeof props.preset !== 'string') return a;
    const seconds = a.item.durationInFrames / fps;
    const enter = typeof props.enter === 'number' ? Math.min(props.enter * r.textPace, Math.max(props.enter, seconds * 0.4)) : props.enter;
    // words placed on beats keep their beats; only the gap between free units scales
    const stagger = typeof props.stagger === 'number' && !Array.isArray(props.beats) ? props.stagger * r.textPace : props.stagger;
    return { ...a, item: { ...a.item, props: { ...props, enter, ...(stagger !== undefined ? { stagger } : {}), overshoot: r.textOvershoot } } } as AtomicAction;
  });
}
