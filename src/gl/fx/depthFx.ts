// Reelsmith RS-1238: effects that read the photo's depth map (u_depth, white = near; see server/reelsmith/depthMap.ts).
import type { FxDef } from './uniforms';
import parallaxFrag from './photo-parallax.frag.ts';
import lensBlurFrag from './lens-blur.frag.ts';
import depthHazeFrag from './depth-haze.frag.ts';
import relightFrag from './relight.frag.ts';

export const PHOTO_PARALLAX_FX = 'builtin:fx-photo-parallax';
// RS-1260: effects that read a depth map per frame of a video (its depth track) or a photo's still map
export const LENS_BLUR_FX = 'builtin:fx-lens-blur';
export const DEPTH_HAZE_FX = 'builtin:fx-depth-haze';
export const RELIGHT_FX = 'builtin:fx-relight';
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
  [LENS_BLUR_FX]: {
    id: LENS_BLUR_FX,
    name: 'Lens blur',
    desc: 'A background blur by depth, like iPhone Cinematic mode: the person (or whatever is near in the middle of the frame) stays sharp and the view behind them goes soft, more with distance. With a focus pull the focus moves from the person to the view (or back) at a set moment, on a beat. Uses the Photo depth model (a depth map for every frame of a video); without it the shot is unchanged.',
    needsDepth: true,
    depthTrack: true,
    frag: lensBlurFrag,
    props: [
      { key: 'focus', label: 'Focus (-1 the subject, 0 far, 1 near)', default: -1, min: -1, max: 1, step: 0.05 },
      { key: 'blur', label: 'Blur', default: 0.012, min: 0, max: 0.03, step: 0.001 },
      { key: 'range', label: 'Sharp depth range', default: 0.1, min: 0, max: 0.5, step: 0.01 },
      { key: 'pullTo', label: 'Pull focus to (-1 no pull, 0 far, 1 near)', default: -1, min: -1, max: 1, step: 0.05 },
      { key: 'at', label: 'Pull at (s into the clip)', default: 1, min: 0, max: 60, step: 0.05 },
      { key: 'pullTime', label: 'Pull time (s)', default: 0.6, min: 0.05, max: 4, step: 0.05 },
    ],
  },
  [DEPTH_HAZE_FX]: {
    id: DEPTH_HAZE_FX,
    name: 'Depth haze',
    desc: 'Air between the ridges: far land fades into a soft haze and loses contrast, thicker with distance, while what is near and the sky stay clear. The haze takes the colour of the horizon by default and can drift in slow banks. Made for mountain, valley and city views. Uses the Photo depth model (a depth map for every frame of a video); without it the shot is unchanged.',
    needsDepth: true,
    depthTrack: true,
    // the sky is kept out of the haze
    needsSky: true,
    frag: depthHazeFrag,
    props: [
      { key: 'density', label: 'Density', default: 0.8, min: 0, max: 2, step: 0.05 },
      { key: 'start', label: 'Starts at depth (1 near)', default: 0.3, min: 0.05, max: 1, step: 0.05 },
      { key: 'auto', label: 'Colour from the horizon', default: 1, min: 0, max: 1, step: 0.05 },
      { key: 'color', label: 'Haze colour', kind: 'color', default: [0.8, 0.85, 0.92] },
      { key: 'drift', label: 'Drift', default: 0.5, min: 0, max: 3, step: 0.1 },
    ],
  },
  [RELIGHT_FX]: {
    id: RELIGHT_FX,
    name: 'Relight',
    desc: 'A soft light sweeps across the person: the side of the face and shoulders turned to the light brightens, the other side falls into soft shade, and the view and sky behind stay as they were. The light comes on at a set moment (the drop) and sweeps from one side to the other. Uses the Photo depth model (a depth map for every frame of a video); without it the shot is unchanged.',
    needsDepth: true,
    depthTrack: true,
    frag: relightFrag,
    props: [
      { key: 'strength', label: 'Strength', default: 0.8, min: 0, max: 1.5, step: 0.05 },
      { key: 'from', label: 'Light from (degrees, 0 right, 90 above, 180 left)', default: 160, min: -360, max: 360, step: 5 },
      { key: 'to', label: 'Light to (degrees)', default: 20, min: -360, max: 360, step: 5 },
      { key: 'at', label: 'Light on at (s into the clip)', default: 0, min: 0, max: 60, step: 0.05 },
      { key: 'sweep', label: 'Sweep time (s)', default: 1.5, min: 0.1, max: 8, step: 0.1 },
      { key: 'warmth', label: 'Warm light', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },
};

export const DEPTH_FX_ORDER = [PHOTO_PARALLAX_FX, LENS_BLUR_FX, DEPTH_HAZE_FX, RELIGHT_FX] as const;
