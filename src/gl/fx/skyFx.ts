// Reelsmith RS-1261: effects that read the clip's sky map (u_sky, white = sky; made with its depth map, see
// server/reelsmith/skyMath.ts). Any other effect can also be kept to the land or the sky with mix.region.
import type { FxDef } from './uniforms';
import skyRecoverFrag from './sky-recover.frag.ts';
import skySwapFrag from './sky-swap.frag.ts';

export const SKY_RECOVER_FX = 'builtin:fx-sky-recover';
export const SKY_SWAP_FX = 'builtin:fx-sky-swap';

export const SKY_FX_EFFECTS: Record<string, FxDef> = {
  [SKY_RECOVER_FX]: {
    id: SKY_RECOVER_FX,
    name: 'Sky recover',
    desc: 'Brings back a washed-out phone sky: only the sky is darkened toward the top like a graduated filter, with more colour, a touch more blue and contrast so the clouds show. Ridges, trees and heads against it stay as they were. Uses the sky found with the Photo depth model; without it, a plain graduated filter over the top of the frame.',
    needsSky: true,
    frag: skyRecoverFrag,
    props: [
      { key: 'strength', label: 'Strength', default: 0.7, min: 0, max: 1.5, step: 0.05 },
      { key: 'blue', label: 'Bluer', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },
  [SKY_SWAP_FX]: {
    id: SKY_SWAP_FX,
    name: 'Sky swap',
    desc: 'Replaces the sky with a sunset or a deep blue sky with soft clouds drifting across, and lets the land take a little of the new light. Only where the sky was found (Photo depth model); with no sky found the shot is unchanged. Best on steady shots: the sky is found once per clip.',
    needsSky: true,
    frag: skySwapFrag,
    props: [
      { key: 'style', label: 'Sky (0 sunset, 1 blue)', default: 0, min: 0, max: 1, step: 1 },
      { key: 'clouds', label: 'Clouds', default: 0.6, min: 0, max: 1, step: 0.05 },
      { key: 'drift', label: 'Cloud drift', default: 1, min: 0, max: 4, step: 0.1 },
      { key: 'match', label: 'Light on the land', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
  },
};

export const SKY_FX_ORDER = [SKY_RECOVER_FX, SKY_SWAP_FX] as const;
