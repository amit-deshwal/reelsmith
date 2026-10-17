// Reel looks: one-click grades that stack the grade, glow, lens and texture effects the way a colourist would (e.g. Cinematic
// travel = teal/orange grade + halation + pro-mist + vignette + a touch of grain). A look is just a stack of ordinary clip
// effects, so every slider stays editable afterwards, and applying another look replaces only the effects a look added.
import type { AtomicAction } from '../editor/reducerActions';
import type { ClipEffect, TimelineItem } from '../editor/types';

export interface ReelLookStep { assetId: string; overrides?: Record<string, number | number[]> }
export interface ReelLook { id: string; name: string; mood: string; description: string; steps: ReelLookStep[] }

export const LOOK_EFFECT_PREFIX = 'look_';

export const REEL_LOOKS: ReelLook[] = [
  {
    id: 'cinematic-travel', name: 'Cinematic travel', mood: 'travel, trips, landscapes',
    description: 'Teal and orange grade, warm halation on the highlights, a soft mist glow, a gentle vignette and a touch of grain.',
    steps: [
      { assetId: 'builtin:look-teal-orange', overrides: { intensity: 0.6, contrast: 1.1 } },
      { assetId: 'builtin:fx-halation', overrides: { intensity: 0.6 } },
      { assetId: 'builtin:fx-pro-mist', overrides: { intensity: 0.25 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.35 } },
      { assetId: 'builtin:fx-fine-grain', overrides: { strength: 0.05 } },
    ],
  },
  {
    id: 'golden-hour', name: 'Golden hour', mood: 'warm, sunset, calm, couples',
    description: 'Warm sunset grade with a soft pro-mist glow, drifting light leaks and a light vignette.',
    steps: [
      { assetId: 'builtin:look-sunset', overrides: { intensity: 0.7 } },
      { assetId: 'builtin:fx-pro-mist', overrides: { intensity: 0.5, lift: 0.02 } },
      { assetId: 'builtin:fx-light-leak', overrides: { intensity: 0.35 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.25 } },
    ],
  },
  {
    id: 'neon-night', name: 'Neon night', mood: 'city nights, parties, gaming, energetic',
    description: 'Cyber teal and magenta grade, blue anamorphic streaks off the lights, bloom and a darker frame.',
    steps: [
      { assetId: 'builtin:look-cyber', overrides: { intensity: 0.75 } },
      { assetId: 'builtin:fx-anamorphic-flare', overrides: { intensity: 2 } },
      { assetId: 'builtin:fx-bloom', overrides: { intensity: 0.6, threshold: 0.65 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.45 } },
    ],
  },
  {
    id: 'retro-vhs', name: 'Retro VHS', mood: 'throwback, 2000s, nostalgic, funny',
    description: 'Worn tape wobble and tracking band, warm faded colour, grain and a dark corner.',
    steps: [
      { assetId: 'builtin:look-warm', overrides: { intensity: 0.5 } },
      { assetId: 'builtin:fx-vhs' },
      { assetId: 'builtin:fx-fine-grain', overrides: { strength: 0.09 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.4 } },
    ],
  },
  {
    id: 'old-film', name: 'Old film', mood: 'memories, family, vintage, storytelling',
    description: 'Sepia tone with dust, scratches, flicker and gate weave, heavy grain and a deep vignette.',
    steps: [
      { assetId: 'builtin:fx-sepia' },
      { assetId: 'builtin:fx-film-damage' },
      { assetId: 'builtin:fx-fine-grain', overrides: { strength: 0.14, size: 1.8 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.6 } },
    ],
  },
  {
    id: 'soft-pastel', name: 'Soft pastel', mood: 'lifestyle, food, aesthetic, selfies',
    description: 'Fuji portrait colour with a gentle pro-mist glow and a little extra clarity. Clean and flattering.',
    steps: [
      { assetId: 'builtin:look-fuji-portra', overrides: { intensity: 0.8 } },
      { assetId: 'builtin:fx-pro-mist', overrides: { intensity: 0.3, lift: 0.025 } },
      { assetId: 'builtin:fx-clarity', overrides: { amount: 0.15 } },
    ],
  },
  {
    id: 'moody-bleach', name: 'Moody bleach', mood: 'dramatic, urban, trek, serious',
    description: 'Bleach-bypass grade, a restrained halation, a dark vignette and grain.',
    steps: [
      { assetId: 'builtin:look-bleach', overrides: { intensity: 0.8 } },
      { assetId: 'builtin:fx-halation', overrides: { intensity: 0.5 } },
      { assetId: 'builtin:fx-soft-vignette', overrides: { strength: 0.5 } },
      { assetId: 'builtin:fx-fine-grain', overrides: { strength: 0.07 } },
    ],
  },
  {
    id: 'comic-pop', name: 'Comic pop', mood: 'playful, friends, funny, kids',
    description: 'Vivid Velvia colour pushed into flat bands with ink outlines, like a comic panel.',
    steps: [
      { assetId: 'builtin:look-fuji-velvia', overrides: { intensity: 0.6 } },
      { assetId: 'builtin:fx-cartoon', overrides: { levels: 7, edge: 1 } },
    ],
  },
];

export const lookById = (id: string) => REEL_LOOKS.find((look) => look.id === id);
export const isLookEffect = (effect: ClipEffect) => effect.id.startsWith(LOOK_EFFECT_PREFIX);
const styleable = (item: TimelineItem) => item.kind === 'video' || item.kind === 'image';

/** The effect stack a look adds to one clip. Ids carry the look so a later look can find and replace them. */
export function lookEffects(look: ReelLook): ClipEffect[] {
  return look.steps.map((step, i) => ({
    id: `${LOOK_EFFECT_PREFIX}${look.id}_${i}`,
    assetId: step.assetId,
    overrides: step.overrides ? { ...step.overrides } : {},
  }));
}

export interface LookPlan { actions: AtomicAction[]; clips: number; label: string }

/**
 * setEffects for each target clip: effects a look added earlier are replaced, anything the user added by hand is kept in front.
 * look = null clears the looks. `only` limits it to those clip ids; nothing is changed on audio, text or solids.
 */
export function planLook(items: readonly TimelineItem[], look: ReelLook | null, only?: readonly string[]): LookPlan {
  const targets = items.filter((item) => styleable(item) && (!only || only.includes(item.id)));
  const actions: AtomicAction[] = targets.map((item) => ({
    type: 'setEffects',
    id: item.id,
    effects: [...(item.effects ?? []).filter((effect) => !isLookEffect(effect)), ...(look ? lookEffects(look) : [])],
  }));
  return { actions, clips: targets.length, label: look ? `Look: ${look.name}` : 'Clear look' };
}
