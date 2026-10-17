// Pure transition-type helpers — split from transitionPreview.tsx so that
// file only exports components (react only-export-components).
import { CSS_TRANSITION_TYPES } from './types';
import type { CssTransitionType, TransitionItem } from './types';

const PREVIEW_APPROXIMATION: Partial<Record<TransitionItem['type'], CssTransitionType>> = {
  'clean-line-wipe': 'soft-wipe',
  'page-curl': 'soft-wipe',
  'impact-shake': 'whip-pan',
  'rack-focus': 'luma-blend',
  'organic-dissolve': 'luma-blend',
  'anticipation-zoom': 'luma-blend',
  'radial-blur': 'luma-blend',
  'glitch-cut': 'flash',
  'dip-to-color': 'dip-to-black',
  bars: 'soft-wipe',
  'wide-bars': 'soft-wipe',
  window: 'luma-blend',
  'zoom-through': 'luma-blend',
  'whip-blur': 'whip-pan',
  'spin-zoom': 'luma-blend',
  'light-leak': 'flash',
  'chroma-glitch': 'flash',
  'fluted-glass': 'soft-wipe',
  'ripple-dissolve': 'luma-blend',
  'tile-pop': 'luma-blend',
  'cube-turn': 'soft-wipe',
  'slide-over': 'soft-wipe',
};

export function previewTransitionType(type: TransitionItem['type']): CssTransitionType {
  if (CSS_TRANSITION_TYPES.has(type)) return type as CssTransitionType;
  return PREVIEW_APPROXIMATION[type] ?? 'cross-dissolve';
}
