// Reelsmith RS-1238: effects that read the photo's depth map (u_depth, white = near; see server/reelsmith/depthMap.ts).
import type { FxDef } from './uniforms';
import parallaxFrag from './photo-parallax.frag.ts';

export const PHOTO_PARALLAX_FX = 'builtin:fx-photo-parallax';
/** `move` values of the photo-parallax effect */
export const PARALLAX_MOVES = ['dolly', 'orbit', 'rise'] as const;
export type ParallaxMove = typeof PARALLAX_MOVES[number];

export const DEPTH_FX_EFFECTS: Record<string, FxDef> = {
  [PHOTO_PARALLAX_FX]: {
    id: PHOTO_PARALLAX_FX,
    name: 'Photo parallax',
    desc: 'A still photo becomes a 3D camera move: near things move more than far ones, like the camera walking in (dolly), sliding around the scene (orbit) or lifting (rise). Made for landscapes and scenery with no one in them; steady video works too. Uses the photo\'s depth map (the Photo depth model); without it the move is a plain push or pan.',
    needsDepth: true,
    frag: parallaxFrag,
    props: [
      { key: 'move', label: 'Move (0 dolly in, 1 orbit, 2 rise)', default: 0, min: 0, max: 2, step: 1 },
      { key: 'strength', label: 'Strength', default: 1, min: 0, max: 2, step: 0.05 },
      { key: 'focus', label: 'Orbit around (0 far, 1 near)', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },
};

export const DEPTH_FX_ORDER = [PHOTO_PARALLAX_FX] as const;
