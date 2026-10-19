// RS-413: what the agent is told about the break-in transitions (browse_library) and their default length.
import { defaultTransitionSeconds } from '../editor/transitionTypes';

export const BREAK_IN_INFO: Record<string, string> = {
  bars: 'Break-in: the next shot slides in through 6 vertical bars, alternating from top and bottom with a stagger, then settles on the full frame. Fixed props: 6 bars, alternate direction, stagger 0.5, smooth easing; only durationInFrames is adjustable (default 0.35 s). One style per reel; cut on the beat.',
  'wide-bars': 'Break-in: the next shot slides in through 3 wide bars, horizontal rows from alternating sides. Fixed props: 3 bars, stagger 0.4, smooth easing; only durationInFrames is adjustable (default 0.35 s). Same use as bars, calmer.',
  window: 'Break-in: the next shot appears inside a centred rounded window with a soft shadow that grows to the full frame; the window stays inside the Instagram safe zone until 80% of the transition. Fixed props: start size 30%, corner radius 3%; only durationInFrames is adjustable (default 0.35 s).',
  'zoom-through': 'Reels transition (0.4 s): the camera punches into the current shot with radial streaks and a colour fringe, then comes out of the next one. Punchy, fits fast cuts and beat drops. Props fixed; only durationInFrames changes.',
  'whip-blur': 'Reels transition (0.3 s): both shots whip past on one strip with directional motion blur and a colour split along the motion. The most natural fast cut; use direction left/right/up/down to match the camera move. Props fixed; only durationInFrames and direction change.',
  'spin-zoom': 'Reels transition (0.45 s): the shot spins and scales away while the next spins in from the other turn, with angular blur. Energetic; good for dance, action, a drop. Direction right/down spins the other way.',
  'light-leak': 'Reels transition (0.6 s): a warm film light-leak washes across from one side and the cut happens under it. Soft and cinematic; best for travel, golden hour and calm reels. direction picks the side the light comes from.',
  'chroma-glitch': 'Reels transition (0.35 s): the picture tears into bands that jump sideways and split into red/green/blue, swapping to the next shot band by band. Techy; for tech, gaming and hard beats.',
  'fluted-glass': 'Reels transition (0.5 s): the frame is seen through ribbed glass that refracts, flips each rib to the next shot at its own moment and clears. Stylish and calm; good for aesthetic and lifestyle reels.',
  'ripple-dissolve': 'Reels transition (0.55 s): a ring expands from the centre; inside it the next shot, with a water-like ripple at the front. Dreamy; good for nature, water and slow reels.',
  'tile-pop': 'Reels transition (0.5 s): the next shot pops open as a mosaic of rounded windows growing from the middle outward. Playful; good for collages, photo dumps and friends.',
  'cube-turn': 'Reels transition (0.5 s): the shots are faces of a cube that turns, with depth and shading. direction left/right turns sideways, up/down turns vertically. Good for before/after and place changes.',
  'slide-over': 'Reels transition (0.4 s): the next shot slides over the current one with an ease-out while the current one drifts back, dims and gets a soft shadow. Clean and quick; the safest pick for vlogs and talking reels.',
  'pixelate': "Reels transition (0.4 s): the shot breaks into square pixels that grow to their coarsest in the middle, swap to the next shot pixel by pixel and sharpen back. A tech reveal, gaming, or a censored-joke cut.",
  'film-burn': "Reels transition (0.6 s): a warm film burn blooms from a corner (hot white core, ragged orange rim, overexposure) and the cut happens under its brightest moment. Vintage travel, memories, golden hour. direction picks the corner it starts from.",
  'flip-3d': "Reels transition (0.45 s): the shot is a card that spins away in 3D perspective, edge-on in the middle, and the next shot spins in on its back. direction left/right spins sideways, up/down top over bottom. Sports, fitness, energetic cuts.",
  'mirror-flip': "Reels transition (0.3 s): the frame flips like a flat coin on the beat, squeezing to a bright line and opening out as the next shot. Before/after reveals, outfit changes, a drop. up/down flips top over bottom.",
  'prism-flash': "Reels transition (0.4 s): a bright band of light sweeps across, splitting into rainbow prism fringes, with the next shot behind it. Fashion, nights out, a polished cut. direction sets the sweep.",
  'brush-wipe': "Reels transition (0.55 s): the next shot is painted on in four thick brush strokes, alternating direction, with ragged bristle edges and an ink line at each front. Art, journals, handmade and scrapbook stories.",
};

/** Default transition length in frames: break-ins are 0.35 s, the Reels transitions have their own (0.3 to 0.6 s), everything else keeps the editor's own default (null). */
export function breakInDefaultFrames(type: string, fps: number, maxFrames: number): number | null {
  const seconds = defaultTransitionSeconds(type);
  return seconds === null ? null : Math.max(2, Math.min(Math.round(seconds * fps), maxFrames));
}
