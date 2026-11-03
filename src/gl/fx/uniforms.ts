// Pure uniform helpers for per-clip effects — no shader imports, so this is
// runnable under `npx tsx` (shader sources live in the generated `*.frag.ts` twins).
// gn(name, default, min, max) = clamp(properties[name] ?? default).
import type { FxPass, UniformValue } from '../runtime.js';
import { getCubeSync } from './cube.js';
import reelCopyFrag from './reel-copy.frag.ts';
import reelMixFrag from './reel-mix.frag.ts';

interface FxNumberProperty {
  key: string;   // Property name in properties[key].
  label: string; // zh UI label
  kind?: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  /** Shader uniform name; defaults to `u_<key>`. Set when a property maps to a
   * property to a differently-named uniform (e.g. rect-mask width→u_rect_width). */
  uniform?: string;
}

interface FxColorProperty {
  key: string;
  label: string;
  kind: 'color';
  default: number[];
  uniform?: string;
}

export type FxProperty = FxNumberProperty | FxColorProperty;

export interface FxDef {
  id: string;    // Asset id (builtin:fx-…).
  name: string;  // Display name.
  desc: string;  // Chinese description.
  frag: string;
  props: FxProperty[];
  /** linear multi-pass effects (tilt-shift): fragment shaders run in
   * order, each reading the previous pass's output. When set, `frag` is the
   * first pass (kept for single-pass callers/back-compat). */
  passes?: string[];
  /** renderPass graph for effects that reuse an earlier output. */
  pipeline?: (uniforms: Record<string, UniformValue>) => FxPass[];
  /** .cube 3D LUT URL(/luts/<file>);frag should be universal lut.frag(u_lut+u_intensity) */
  cube?: string;
  /** Reelsmith: the shader reads u_mask (the person matte) and u_subjectCenter / u_subjectSize / u_subjectArea */
  needsMask?: boolean;
  /** Reelsmith: the shader reads u_depth (the photo's depth map, white = near; flat grey until there is one) and u_progress
   * (0..1 through the clip) */
  needsDepth?: boolean;
  /** Reelsmith RS-1261: the shader reads u_sky (the sky map made with the depth map, white = sky; black until there is one)
   * and u_hasSky */
  needsSky?: boolean;
  /** Reelsmith: the shader also reads u_text (a word drawn by the renderer, see ../textLayer.ts) and u_textAspect */
  needsText?: boolean;
  /** Reelsmith: which word list `word` indexes ('title' = the movie titles, default = the behind-you words) */
  textKind?: 'title' | 'scenery' | 'tag';
  /** Reelsmith: the shader reads the clip as it looked 1..taps steps ago (u_hist0.., each with its matte u_histMask0..); the
   * step length in seconds is the `stepKey` setting, read by ClipFx rather than the shader */
  history?: { taps: number; stepKey: string; countKey: string };
}

/** Serializable subset of FxDef (without pipeline function field): persisted with TimelineState.fxDefs,
 * Let plugin/submit_shader's custom fx work on refresh and headless export (fresh browser, no memory registry)
 * Rendered self-contained. The structure can be used directly as FxDef (registerCustomFx accepts). */
export interface SerializableFxDef {
  id: string;
  name: string;
  desc: string;
  frag: string;
  props: FxProperty[];
  passes?: string[];
  cube?: string;
}

/** Reelsmith: an effect's envelope at this frame (see src/reelsmith/effectMix.ts); region 0 all, 1 person, 2 background, 3 land, 4 sky. */
export interface FxMix { amount: number; region: number; hasMask?: number; hasSky?: number; /** the sky's colour model (skyModelUniforms) */ sky?: Record<string, UniformValue> }

// Clamp properties[name] to the declared minimum and maximum.
export function fxUniform(p: FxProperty, overrides?: Record<string, UniformValue>): UniformValue {
  const v = overrides?.[p.key];
  if (p.kind === 'color') {
    return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
      ? v.map((n) => Math.min(1, Math.max(0, n)))
      : [...p.default];
  }
  const raw = typeof v === 'number' && Number.isFinite(v) ? v : p.default;
  return Math.min(p.max, Math.max(p.min, raw));
}

/** the uniform map for an effect instance (u_<key> → clamped value) */
export function fxUniforms(def: FxDef, overrides?: Record<string, UniformValue>): Record<string, UniformValue> {
  const out: Record<string, UniformValue> = {};
  for (const p of def.props) out[p.uniform ?? `u_${p.key}`] = fxUniform(p, overrides);
  return out;
}

/** Flatten effect-local pass graphs into one clip-local chain, rebasing every
 * explicit pass reference so effect N consumes effect N-1's output. */
export function fxPasses(
  effects: Array<{ def: FxDef; overrides?: Record<string, UniformValue>; extraUniforms?: Record<string, UniformValue>; mix?: FxMix }>,
  time: number,
): FxPass[] {
  const out: FxPass[] = [];
  for (const { def, overrides, extraUniforms, mix } of effects) {
    // Reelsmith envelope: an effect at zero strength is skipped; a partial or regional one is blended over its input after
    if (mix && mix.amount <= 1e-3) continue;
    const blend = !!mix && (mix.amount < 0.999 || mix.region !== 0);
    if (blend && out.length === 0) out.push({ frag: reelCopyFrag });
    const before = out.length - 1;
    const uniforms: Record<string, UniformValue> = { ...fxUniforms(def, overrides), ...extraUniforms, u_time: time };
    let lut3d;
    if (def.cube) {
      // Semantics: LUT not ready (loading/failed) = transparent transmission. If intensity is pressed to 0, runtime will give
      // u_lut binds dummy units to avoid sampler type crashes.
      lut3d = getCubeSync(def.cube) ?? undefined;
      if (!lut3d) uniforms.u_intensity = 0;
    }
    const local: FxPass[] = def.pipeline?.(uniforms)
      ?? def.passes?.map((frag) => ({ frag, uniforms }))
      ?? [{ frag: def.frag, uniforms, lut3d }];
    const offset = out.length;
    for (const pass of local) {
      out.push({
        ...pass,
        inputFrom: pass.inputFrom == null ? undefined : pass.inputFrom + offset,
        samplers: pass.samplers
          ? Object.fromEntries(Object.entries(pass.samplers).map(([name, index]) => [name, index + offset]))
          : undefined,
      });
    }
    if (blend) out.push({ frag: reelMixFrag, uniforms: { u_amount: mix!.amount, u_region: mix!.region, u_hasMask: mix!.hasMask ?? 0, u_hasSky: mix!.hasSky ?? 0, ...(mix!.sky ?? { u_hasSkyModel: 0 }) }, samplers: { u_before: before } });
  }
  // every effect is at zero strength right now: still draw the clip
  if (!out.length && effects.length) out.push({ frag: reelCopyFrag });
  return out;
}
