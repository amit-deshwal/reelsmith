// Lines behind the person (RS-1206): the director places a copy of each shot under the line on a lane above the text,
// marked props.rsFront. Once shot matching and looks have given it exactly the effects of the shot beneath, the person
// cut-out goes last, so only the person shows on top, in the same colours.
import type { AtomicAction } from '../../editor/reducerActions';

export const FRONT_CUTOUT = 'builtin:fx-person-cutout';

export function withFrontCutouts(actions: AtomicAction[]): AtomicAction[] {
  return actions.map((a) => {
    if (a.type !== 'add' || !(a.item.props as { rsFront?: unknown } | undefined)?.rsFront) return a;
    if ((a.item.effects ?? []).some((e) => e.assetId === FRONT_CUTOUT)) return a;
    return { ...a, item: { ...a.item, effects: [...(a.item.effects ?? []), { id: `${a.item.id}-cut`, assetId: FRONT_CUTOUT, overrides: { white: 0 } }] } };
  });
}
