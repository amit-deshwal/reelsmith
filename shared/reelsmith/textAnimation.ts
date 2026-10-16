// Text in/out animations as ordinary keyframes (opacity / y / scale), so preview and export render them
// with the editor's existing keyframe system and one undo step covers a whole change.
export type TextAnimPreset = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'pop' | 'zoom' | 'drop';

export const TEXT_ANIM_PRESETS: ReadonlyArray<{ id: TextAnimPreset; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-up', label: 'Slide up' },
  { id: 'slide-down', label: 'Slide down' },
  { id: 'pop', label: 'Pop' },
  { id: 'zoom', label: 'Zoom in' },
  { id: 'drop', label: 'Drop' },
];

export type AnimProp = 'opacity' | 'y' | 'scale';
export const ANIM_PROPS: readonly AnimProp[] = ['opacity', 'y', 'scale'];

export interface AnimKeyframe { prop: AnimProp; frame: number; value: number; easing: 'easeOut' | 'easeIn' | 'linear' }
export interface AnimBase { y: number; scale: number; opacity: number }

/** Value of each animated prop at the "hidden" end of a preset (the clip edge); absent props stay at base. */
function hiddenState(preset: TextAnimPreset, base: AnimBase): Partial<Record<AnimProp, number>> {
  switch (preset) {
    case 'fade': return { opacity: 0 };
    case 'slide-up': return { opacity: 0, y: base.y + 8 };
    case 'slide-down': return { opacity: 0, y: base.y - 8 };
    case 'pop': return { opacity: 0, scale: base.scale * 0.6 };
    case 'zoom': return { opacity: 0, scale: base.scale * 1.4 };
    case 'drop': return { opacity: 0, y: base.y - 15 };
    default: return {};
  }
}

const baseOf = (prop: AnimProp, base: AnimBase) => base[prop];
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Keyframes for an optional in preset (first `animFrames`) and out preset (last `animFrames`).
 * Frames are item-local. Returns [] when both are 'none'.
 */
export function textAnimationKeyframes(
  inPreset: TextAnimPreset, outPreset: TextAnimPreset, durationInFrames: number, animFrames: number, base: AnimBase,
): AnimKeyframe[] {
  const last = Math.max(1, durationInFrames - 1);
  const n = Math.max(1, Math.min(Math.round(animFrames), Math.floor(last / 2)));
  const out: AnimKeyframe[] = [];
  const inState = hiddenState(inPreset, base);
  const outState = hiddenState(outPreset, base);
  for (const prop of ANIM_PROPS) {
    const b = baseOf(prop, base);
    const kfs: AnimKeyframe[] = [];
    if (prop in inState) { kfs.push({ prop, frame: 0, value: r4(inState[prop]!), easing: 'easeOut' }, { prop, frame: n, value: b, easing: 'linear' }); }
    if (prop in outState) { kfs.push({ prop, frame: last - n, value: b, easing: 'easeIn' }, { prop, frame: last, value: r4(outState[prop]!), easing: 'linear' }); }
    out.push(...kfs);
  }
  return out;
}
