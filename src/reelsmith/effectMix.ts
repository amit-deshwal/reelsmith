// Effect envelopes (RS-1203): how strongly a clip effect shows at each moment and where. An effect without a mix is on at
// full strength for the whole clip, as before. With one it can fade in and out, build up, punch on the song's beats and
// fall back between them, and stay on the person or behind them (the person matte). Times are seconds from the clip's start.

export type EffectRegion = 'all' | 'subject' | 'background';

export interface EffectMix {
  /** peak strength 0..1 (default 1) */
  amount?: number;
  region?: EffectRegion;
  /** the part of the clip the envelope spans, [from, to] seconds (default the whole clip); outside it the effect is off */
  span?: [number, number];
  /** seconds to fade in from the span's start and out to its end */
  fadeIn?: number;
  fadeOut?: number;
  /** grow from nothing to full across the span ('up') or the reverse ('down') */
  ramp?: 'up' | 'down';
  /** seconds where the effect punches to full (the song's beats) */
  hits?: number[];
  /** seconds a punch takes to fall back (default 0.25) */
  decay?: number;
  /** strength between punches as a share of amount (default 0) */
  floor?: number;
}

export const REGION_CODE: Record<EffectRegion, number> = { all: 0, subject: 1, background: 2 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Strength 0..1 of an effect at `t` seconds into a clip of `duration` seconds. */
export function mixAmountAt(mix: EffectMix | undefined, t: number, duration: number): number {
  if (!mix) return 1;
  const amount = clamp01(mix.amount ?? 1);
  const [a, b] = mix.span ?? [0, duration];
  if (t < a - 1e-6 || t > b + 1e-6) return 0;
  let level = amount;
  if (mix.fadeIn && mix.fadeIn > 0) level *= smooth((t - a) / mix.fadeIn);
  if (mix.fadeOut && mix.fadeOut > 0) level *= smooth((b - t) / mix.fadeOut);
  if (mix.ramp && b > a) level *= smooth(mix.ramp === 'up' ? (t - a) / (b - a) : (b - t) / (b - a));
  if (mix.hits?.length) {
    const floor = clamp01(mix.floor ?? 0);
    const decay = Math.max(1e-3, mix.decay ?? 0.25);
    let last = -Infinity;
    for (const h of mix.hits) if (h <= t + 1e-6 && h > last) last = h;
    const pulse = Number.isFinite(last) ? Math.exp(-(t - last) / decay) : 0;
    level *= floor + (1 - floor) * pulse;
  }
  return level;
}

/** The blend the renderer applies after the effect, or undefined when the effect simply shows at full strength. */
export function mixUniformsAt(mix: EffectMix | undefined, t: number, duration: number): { amount: number; region: number } | undefined {
  if (!mix) return undefined;
  return { amount: mixAmountAt(mix, t, duration), region: REGION_CODE[mix.region ?? 'all'] ?? 0 };
}

/**
 * Effects that move or bend the picture: crossfading them over the still picture shows a double image, so the envelope
 * scales their own strength instead (each key from `rest`, its value at zero strength, up to the value set).
 */
export const SCALED_BY_ENVELOPE: Record<string, Array<{ key: string; rest: number }>> = {
  'builtin:fx-zoom-blur': [{ key: 'amount', rest: 0 }],
  'builtin:fx-motion-blur': [{ key: 'amount', rest: 0 }],
  'builtin:fx-shake': [{ key: 'strength', rest: 0 }, { key: 'rotation', rest: 0 }, { key: 'breathe', rest: 0 }, { key: 'zoom', rest: 1 }],
  'builtin:fx-lens-distortion': [{ key: 'distortion', rest: 0 }, { key: 'aberration', rest: 0 }],
  'builtin:fx-fisheye': [{ key: 'strength', rest: 0 }, { key: 'zoom', rest: 1 }],
  'builtin:fx-water-ripple': [{ key: 'amplitude', rest: 0 }],
  'builtin:fx-swirl': [{ key: 'angle', rest: 0 }],
  'builtin:fx-rgb-split': [{ key: 'amount', rest: 0 }],
  'builtin:fx-glitch': [{ key: 'intensity', rest: 0 }],
  'builtin:fx-camera-shake': [{ key: 'strength', rest: 0 }],
  'builtin:fx-bounce': [{ key: 'amount', rest: 0 }],
  'builtin:fx-photo-parallax': [{ key: 'strength', rest: 0 }],
};

/**
 * The overrides and blend for one frame: a scaled effect gets its strength params set from the envelope (and only blends
 * for a region); every other effect keeps its params and blends by the amount.
 */
export function envelopeFrame<V>(
  assetId: string,
  props: ReadonlyArray<{ key: string; default: unknown }>,
  overrides: Record<string, V> | undefined,
  mix: { amount: number; region: number } | undefined,
): { overrides: Record<string, V | number> | undefined; mix: { amount: number; region: number } | undefined } {
  const scaled = mix ? SCALED_BY_ENVELOPE[assetId] : undefined;
  if (!mix || !scaled) return { overrides, mix };
  const out: Record<string, V | number> = { ...(overrides ?? {}) };
  for (const { key, rest } of scaled) {
    const set = overrides?.[key] ?? props.find((p) => p.key === key)?.default;
    if (typeof set === 'number') out[key] = rest + (set - rest) * mix.amount;
  }
  return { overrides: out, mix: mix.region !== 0 ? { amount: mix.amount > 1e-3 ? 1 : 0, region: mix.region } : undefined };
}

/** Plain-words check of a mix from outside (agent tools); returns the cleaned mix or the problems. */
export function parseEffectMix(raw: unknown): { ok: true; mix: EffectMix } | { ok: false; errors: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['mix must be an object'] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  const out: EffectMix = {};
  const num = (k: string, min: number, max: number) => {
    const v = r[k];
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) { errors.push(`mix.${k} must be a number from ${min} to ${max}`); return undefined; }
    return v;
  };
  const amount = num('amount', 0, 1); if (amount !== undefined) out.amount = amount;
  const fadeIn = num('fadeIn', 0, 600); if (fadeIn !== undefined) out.fadeIn = fadeIn;
  const fadeOut = num('fadeOut', 0, 600); if (fadeOut !== undefined) out.fadeOut = fadeOut;
  const decay = num('decay', 0.01, 10); if (decay !== undefined) out.decay = decay;
  const floor = num('floor', 0, 1); if (floor !== undefined) out.floor = floor;
  if (r.region !== undefined) { if (r.region === 'all' || r.region === 'subject' || r.region === 'background') out.region = r.region; else errors.push('mix.region must be all, subject or background'); }
  if (r.ramp !== undefined) { if (r.ramp === 'up' || r.ramp === 'down') out.ramp = r.ramp; else errors.push('mix.ramp must be up or down'); }
  if (r.span !== undefined) {
    const s = r.span;
    if (Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && (s[0] as number) < (s[1] as number)) out.span = [s[0] as number, s[1] as number];
    else errors.push('mix.span must be [from, to] seconds with from < to');
  }
  if (r.hits !== undefined) {
    if (Array.isArray(r.hits) && r.hits.length <= 400 && r.hits.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) out.hits = [...(r.hits as number[])].sort((a, b) => a - b);
    else errors.push('mix.hits must be up to 400 times in seconds');
  }
  return errors.length ? { ok: false, errors } : { ok: true, mix: out };
}
