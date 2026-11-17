// RS-1273 (4): how many lines sit behind the person, and which other sections could carry one (a hold or a cut whose
// first shot shows people), so an explicit "text coming from behind" request is done on every shot that fits, not once.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';

const CARRIERS = new Set(['hold', 'cut']);

export function behindTextCount(plan: Pick<ReelPlan, 'sections' | 'overlays'>, showsPeople: (clipRef: string) => boolean): { placed: number; couldCarry: number[] } {
  const placed = plan.sections.filter((s) => s.textBehind && s.text).length + (plan.overlays ?? []).filter((o) => o.behind).length;
  const couldCarry = plan.sections.flatMap((s, i) => {
    if (s.textBehind || !CARRIERS.has(s.move)) return [];
    const first = s.clips?.[0];
    return first && showsPeople(first) ? [i] : [];
  });
  return { placed, couldCarry };
}

/** The build note, only when the reel already uses the effect (the user asked for it) and more sections could carry it. */
export function behindTextNote(c: { placed: number; couldCarry: number[] }): string | undefined {
  if (!c.placed || !c.couldCarry.length) return undefined;
  return `${c.placed} line${c.placed > 1 ? 's' : ''} behind the person; section${c.couldCarry.length > 1 ? 's' : ''} ${c.couldCarry.join(', ')} could carry one too (a hold or cut on people). When the user asked for text from behind, give those sections a line with textBehind and a big style, and say how many you placed.`;
}
