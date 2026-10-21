// Director stage 4 (RS-1214): the critique. After the first build the agent looks again, harder: three frames a section
// and each line at its fullest, against a checklist written for a picky viewer, plus checks the frames cannot show
// (a kit that drifted from the treatment's tone, a reel made of plain cuts, a slow hook). The one frame a section the
// build returns was enough to catch a wrong arrow, never a reel that looked basic or a word cut off at the edge.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { PLAIN_MOVES, TONE_KIT, toneClashes, type Treatment } from './treatment';

export interface CritiqueFinding { section?: number; issue: string; fix: string }
export type Span = { from: number; to: number };

const usedIds = (plan: ReelPlan) => [
  ...plan.sections.flatMap((s) => [s.move, s.textStyle, s.transition, ...(s.effects ?? []).map((e) => e.id.replace('builtin:fx-', ''))]),
  ...(plan.overlays ?? []).map((o) => o.style), ...(plan.graphics ?? []).map((g) => g.graphic), plan.look,
].filter((x): x is string => typeof x === 'string');

export function critiquePlan(plan: ReelPlan, spans: readonly Span[], treatment?: Treatment): CritiqueFinding[] {
  const out: CritiqueFinding[] = [];
  const n = plan.sections.length;
  if (treatment) {
    const clashes = [...new Set(toneClashes(treatment.tone, usedIds(plan)))];
    if (clashes.length) out.push({ issue: `${clashes.join(', ')} fight the ${treatment.tone} tone you chose`, fix: `use ${TONE_KIT[treatment.tone].prefer.slice(0, 8).join(', ')} instead` });
  }
  const plain = plan.sections.filter((s) => PLAIN_MOVES.has(s.move)).length;
  if (n >= 4 && plain > n / 2) out.push({ issue: `${plain} of ${n} sections are plain cuts or holds`, fix: 'turn the build, the drop or the ending into a move of its own (zoom-punch, break-in, velocity, strips-reveal, split, cards-finale, photo-3d)' });
  const twice = plan.sections.findIndex((s, k) => k > 0 && s.move === plan.sections[k - 1]!.move && s.move !== 'black');
  if (twice > 0) out.push({ section: twice, issue: `sections ${twice - 1} and ${twice} are both ${plan.sections[twice]!.move}`, fix: 'one move, then another: merge them, or change one (a 1-2 beat cut, zoom-punch, photo-3d)' });
  const moving = plan.sections.filter((s, k) => k > 0 && s.transition).length;
  if (n >= 4 && moving === 0) out.push({ issue: 'every section comes in on a hard cut', fix: 'one transition family on the 2-3 changes that matter: into the drop, a new place, the ending' });
  if (n >= 5 && moving > Math.ceil(n * 0.7)) out.push({ issue: `${moving} of ${n - 1} section changes have a transition`, fix: 'keep plain beat cuts as the default; transitions only where something changes' });
  const timed = plan.sections.some((s) => (s.effects ?? []).some((e) => e.timing && e.timing !== 'steady'));
  if (!timed && n >= 4) out.push({ issue: 'no effect moves with the music', fix: 'time one effect to the drop (zoom-blur or light-rays, timing drop) and let the section before it build' });
  const hook = plan.sections[0];
  const hookLen = spans[0] ? spans[0].to - spans[0].from : 0;
  if (hook && PLAIN_MOVES.has(hook.move) && hookLen > 3.5) out.push({ section: 0, issue: `the reel opens on ${hookLen.toFixed(1)} s of one ${hook.move}`, fix: 'open on movement or a reveal in under 2-3 s, then the setup' });
  const styles = new Set([...plan.sections.map((s) => s.textStyle), ...(plan.overlays ?? []).map((o) => o.style)].filter(Boolean));
  if (styles.size > 3) out.push({ issue: `${styles.size} different text styles`, fix: 'two typefaces, three at most' });
  // the last thing people see: a reel that just stops feels unfinished
  const last = plan.sections.at(-1);
  if (last && last.move === 'cut' && !last.text && !last.transition) out.push({ section: n - 1, issue: 'the reel ends on a plain run of cuts with no line', fix: 'end on a hold of the most beautiful shot with the closing line, cards-finale, or black with a big title' });
  return out;
}

/** Frames for the critic: three moments a section (the cut in, the middle, the end) and each line at its fullest. */
export function critiqueFrames(plan: ReelPlan, spans: readonly Span[], fps: number, max = 24): Array<{ frame: number; label: string }> {
  const out: Array<{ frame: number; label: string }> = [];
  const add = (sec: number, label: string) => {
    const frame = Math.max(0, Math.round(sec * fps));
    if (!out.some((f) => Math.abs(f.frame - frame) < fps * 0.25)) out.push({ frame, label });
  };
  spans.forEach((s, k) => {
    const len = s.to - s.from;
    const sec = plan.sections[k]!;
    add(s.from + Math.min(0.2, len * 0.1), `s${k} ${sec.move} in`);
    add(s.from + len * 0.5, `s${k} ${sec.move} mid`);
    if (sec.text) add(s.from + len * 0.8, `s${k} line "${sec.text.slice(0, 24)}"`);
    else add(s.from + len * 0.9, `s${k} ${sec.move} end`);
  });
  for (const o of plan.overlays ?? []) {
    const a = spans[o.from]?.from, b = spans[o.to]?.to;
    if (a !== undefined && b !== undefined) add(a + (b - a) * 0.6, `overlay "${o.text.slice(0, 24)}"`);
  }
  out.sort((a, b) => a.frame - b.frame);
  // over the budget: keep every section's middle and every line, then thin the rest evenly
  if (out.length <= max) return out;
  const must = out.filter((f) => / mid$|line|overlay/.test(f.label));
  const rest = out.filter((f) => !must.includes(f));
  const room = Math.max(0, max - must.length);
  const step = rest.length / Math.max(1, room);
  const kept = room ? Array.from({ length: room }, (_, i) => rest[Math.floor(i * step)]!) : [];
  return [...must.slice(0, max), ...kept].sort((a, b) => a.frame - b.frame);
}

/** The critic's checklist: what to look for in the frames before the one rebuild. */
export function criticBrief(treatment?: Treatment): string {
  return [
    'Stage 4: critique. You are now a picky creative director seeing this reel cold. Go through the frames and answer each:',
    '1. Hook: would the first second stop someone scrolling (movement, a face, a reveal), or is it a static selfie with a caption?',
    '2. Words: every letter inside the frame (no word cut off at an edge or wrapped badly), off faces, readable against the shot; does each style fit the tone' + (treatment ? ` (${treatment.tone})` : '') + '?',
    '3. Shots: any soft, dark, shaky or dull frame where a better moment exists in the shot log? the same shot twice in a row?',
    '4. The drop: does the move, the effect and the cut land together, or does the peak pass unnoticed?',
    '5. Craft: does anything look like a free template (a stock caption box, a transition on every cut, an effect for its own sake) or childish next to the story?',
    '6. Ending: does it end on the best shot with the closing line and a clear last beat, or just stop?',
    '7. Graphics: does each one point at the right person or thing, and stay readable?',
    'Then write the upgrades (at least three concrete changes: "s0: open on #4@6 moving, line in rise-lines"), and make them all in ONE rebuild with replaceTimeline true. If the frames truly show nothing to improve, say so in one line and finish.',
  ].join('\n');
}
