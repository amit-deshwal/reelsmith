// Aims the director's marker graphics (annotate) at the person they name, after the build. The build itself only knows
// one face per moment, so in a selfie with a friend behind it the arrow labelled "bro" landed on the selfie-taker, or
// (a covered face, nothing found) in the middle of the frame and the agent guessed coordinates. Here every person in the
// shot under the marker is found (peopleFinder.ts) and the plan's `who` (or the label) picks one.
import type { AtomicAction } from '../../editor/reducerActions';
import { coverFocus, type AimShot } from './graphics';

/** One person in a picture, as fractions of it: their whole body box and, when the face detector saw it, their face. */
export interface FoundPerson { x: number; y: number; w: number; h: number; score: number; face?: { x: number; y: number; w: number; h: number } }
export type PeopleFinder = (shot: AimShot) => Promise<FoundPerson[]>;
export type Who = 'auto' | 'front' | 'back' | 'left' | 'right' | 'middle';

const SELF = /^(me|i|myself|that'?s me|this is me|me again|moi|yo)\b/i;
const area = (p: FoundPerson) => p.w * p.h;
const cx = (p: FoundPerson) => p.x + p.w / 2;

/** Which person `who` means. auto: one person is that person; "me" is the nearest (biggest); anyone else is the next one. */
export function pickPerson(people: readonly FoundPerson[], who: string, label: string): FoundPerson | undefined {
  const all = [...people].sort((a, b) => area(b) - area(a));
  if (all.length <= 1) return all[0];
  switch (who as Who) {
    case 'front': return all[0];
    case 'back': return all.at(-1);
    case 'left': return all.reduce((a, b) => (cx(b) < cx(a) ? b : a));
    case 'right': return all.reduce((a, b) => (cx(b) > cx(a) ? b : a));
    case 'middle': return all.reduce((a, b) => (Math.abs(cx(b) - 0.5) < Math.abs(cx(a) - 0.5) ? b : a));
    default: return SELF.test(label.trim()) ? all[0] : all[1];
  }
}

/** Their head, as a rect of the picture: the face when it was seen, else the top of the body box. */
export function headOf(p: FoundPerson, shot: Pick<AimShot, 'width' | 'height'>): { x: number; y: number; w: number; h: number } {
  if (p.face) return p.face;
  const side = Math.min(p.w * shot.width * 0.45, p.h * shot.height * 0.2);
  const w = side / shot.width, h = side / shot.height;
  return { x: cx(p) - w / 2, y: p.y, w, h };
}

/** Sets tx/ty/tr of every marker that recorded its shot (rsAim). Returns notes for the agent, one per marker it could not aim. */
export async function aimMarkers(actions: AtomicAction[], find: PeopleFinder): Promise<string[]> {
  const notes: string[] = [];
  for (const a of actions) {
    if (a.type !== 'add') continue;
    const props = (a.item as { props?: Record<string, unknown> }).props;
    const aim = props?.rsAim as (AimShot & { who: string; label: string; faced: boolean }) | undefined;
    if (!props || !aim) continue;
    delete props.rsAim;
    const people = await find(aim).catch(() => []);
    const person = pickPerson(people, aim.who, aim.label);
    const focus = person && coverFocus(headOf(person, aim), aim, a.item.width, a.item.height);
    if (focus) Object.assign(props, { tx: focus.x, ty: focus.y, tr: focus.r });
    else if (!aim.faced) notes.push(`the marker "${aim.label}" found nobody in its shot and points at the middle; set its x and y, or put it on a shot where the person is clear.`);
    else notes.push(`the marker "${aim.label}" found no person in its shot and kept the face found there; check it in the frame.`);
  }
  return notes;
}
