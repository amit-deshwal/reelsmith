// RS-413: what the agent is told about the break-in transitions (browse_library) and their default length.
import { BREAK_IN_SECONDS, BREAK_IN_TRANSITIONS } from '../editor/transitionTypes';

export const BREAK_IN_INFO: Record<string, string> = {
  bars: 'Break-in: the next shot slides in through 6 vertical bars, alternating from top and bottom with a stagger, then settles on the full frame. Fixed props: 6 bars, alternate direction, stagger 0.5, smooth easing; only durationInFrames is adjustable (default 0.35 s). One style per reel; cut on the beat.',
  'wide-bars': 'Break-in: the next shot slides in through 3 wide bars, horizontal rows from alternating sides. Fixed props: 3 bars, stagger 0.4, smooth easing; only durationInFrames is adjustable (default 0.35 s). Same use as bars, calmer.',
  window: 'Break-in: the next shot appears inside a centred rounded window with a soft shadow that grows to the full frame; the window stays inside the Instagram safe zone until 80% of the transition. Fixed props: start size 30%, corner radius 3%; only durationInFrames is adjustable (default 0.35 s).',
};

/** Default transition length in frames: break-ins are 0.35 s, everything else keeps the editor's own default (null). */
export function breakInDefaultFrames(type: string, fps: number, maxFrames: number): number | null {
  return BREAK_IN_TRANSITIONS.has(type) ? Math.max(2, Math.min(Math.round(BREAK_IN_SECONDS * fps), maxFrames)) : null;
}
