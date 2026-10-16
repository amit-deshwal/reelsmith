// RS-410: adjustable props of the "window" grow-in, stored on the transition item as customUniforms.
import { WINDOW_LIMIT } from '../gl/transitions';
import { safeRect } from './safeZone';

export const WINDOW_DEFAULTS = { u_start: 0.3, u_radius: 0.03, u_shadow: 0.5, u_cy: 0.5 } as const;

/** Centre-Y range (canvas fraction) that keeps the window, at its 80% size, inside Instagram's safe zone. */
export function windowCentreYRange(canvas: { width: number; height: number }): [number, number] {
  const s = safeRect(canvas);
  const lo = s.y / canvas.height + WINDOW_LIMIT[1];
  const hi = (s.y + s.h) / canvas.height - WINDOW_LIMIT[1];
  return lo <= hi ? [lo, hi] : [0.5, 0.5];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Merge stored overrides into the shader uniforms, clamped so the safe-zone guarantee still holds. */
export function windowUniforms(
  base: Record<string, unknown>,
  stored: Record<string, number> | undefined,
  canvas: { width: number; height: number },
): Record<string, unknown> {
  const [lo, hi] = windowCentreYRange(canvas);
  const g = (k: keyof typeof WINDOW_DEFAULTS) => (Number.isFinite(stored?.[k]) ? (stored![k] as number) : WINDOW_DEFAULTS[k]);
  return {
    ...base,
    u_start: clamp(g('u_start'), 0.1, 1),
    u_radius: clamp(g('u_radius'), 0, 0.1),
    u_shadow: clamp(g('u_shadow'), 0, 1),
    u_center: [0.5, clamp(g('u_cy'), lo, hi)],
  };
}
