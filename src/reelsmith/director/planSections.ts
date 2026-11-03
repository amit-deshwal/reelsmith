// director@1 plan checks (RS-1201): a ReelPlan's moves, params, texts, effects and sounds against the catalogue, before
// any song or clip is needed. Split out of assembleDirector.ts, which re-exports resolveParams and resolvePlanSections.
import type { PlanValue, ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { ALL_FX } from '../../gl/fx/effects';
import { getCustomTransition } from '../../gl/customTransitions';
import { lookById } from '../looks';
import { directorEffectById, directorTransitionById } from './catalog';
import { checkGraphics } from './graphics';
import { moveById, textStyleById, type MoveParam } from './moves';
import { isLibrarySound } from './sfx';

/** A section effect's asset: a catalogue effect, or a custom one the agent registered this session (custom:fx-*). */
export const effectAsset = (id: string) => directorEffectById(id)?.id ?? (id.startsWith('custom:fx-') && ALL_FX[id] ? id : undefined);
export const isCustomTransition = (id: string) => id.startsWith('custom:tr-') && !!getCustomTransition(id);

/** A number given as text ("4", "0.5") is read as the number; anything else stays as it is. */
const asNumber = (v: PlanValue): PlanValue => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);

/** Whether `v` is a valid value for the param as given (no clamping or coercion). */
export function fitsParam(d: MoveParam, v: PlanValue): boolean {
  if (d.type === 'number') return typeof v === 'number' && Number.isFinite(v) && (d.min === undefined || v >= d.min) && (d.max === undefined || v <= d.max);
  if (d.type === 'boolean') return typeof v === 'boolean';
  if (d.type === 'enum') return !!d.options?.includes(String(v));
  if (d.type === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  return typeof v === 'string';
}

/**
 * Params with defaults filled and values checked against the move's (or text style's) declared params.
 * RS-1258: with `warnings`, a value the build can repair is repaired and reported there instead of refusing the plan: a
 * number out of range is clamped, a number written as text is read, an unknown key or an unusable value is left out
 * (the default stays). A refused plan cost the agent a whole re-plan (10-20 s) in half of the measured director runs.
 */
export function resolveParams(defs: readonly MoveParam[], given: Record<string, PlanValue> | undefined, where: string, errors: string[], warnings?: string[]): Record<string, PlanValue> {
  const out: Record<string, PlanValue> = Object.fromEntries(defs.map((d) => [d.id, d.default]));
  const problem = (strict: string, lenient: string) => (warnings ? warnings.push(lenient) : errors.push(strict));
  for (const [k, raw] of Object.entries(given ?? {})) {
    const d = defs.find((x) => x.id === k);
    if (!d) { problem(`${where}: unknown param "${k}" (allowed: ${defs.map((x) => x.id).join(', ') || 'none'})`, `${where}: param "${k}" is not one this takes (${defs.map((x) => x.id).join(', ') || 'none'}); left out`); continue; }
    const v = d.type === 'number' && warnings ? asNumber(raw) : raw;
    if (d.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || (d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))) {
      if (warnings && typeof v === 'number' && Number.isFinite(v)) {
        const clamped = Math.min(d.max ?? v, Math.max(d.min ?? v, v));
        warnings.push(`${where}.${k} ${v} is outside ${d.min}-${d.max}; used ${clamped}`);
        out[k] = clamped;
      } else problem(`${where}.${k} must be a number from ${d.min} to ${d.max}`, `${where}.${k} must be a number from ${d.min} to ${d.max}; kept ${d.default}`);
      continue;
    }
    if (!fitsParam(d, v)) {
      const want = d.type === 'boolean' ? 'true or false' : d.type === 'enum' ? `one of ${d.options?.join(', ')}` : d.type === 'color' ? 'a colour like #ff0000' : 'text';
      problem(d.type === 'boolean' || d.type === 'text' ? `${where}.${k} must be ${want}` : `${where}.${k} must be ${want}`, `${where}.${k} must be ${want}; kept ${JSON.stringify(d.default)}`);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * RS-1258: a section's params feed its move and its text style, and both may declare the same key (`every` is beats per
 * shot for `cut`, beats per word for `punch-caps` and `slam`). A value goes to each one it fits; when it fits only the
 * move it is the move's alone and the style keeps its own default (the agent's `cut` with `every: 4` under a punch-caps
 * line was refused as "every must be a number from 0.25 to 2" in 8 of 46 director sessions). A key neither declares
 * is left out with a warning.
 */
export function splitSectionParams(given: Record<string, PlanValue> | undefined, moveDefs: readonly MoveParam[], styleDefs: readonly MoveParam[] | undefined, where: string, names: { move: string; style?: string }, warnings: string[]) {
  const forMove: Record<string, PlanValue> = {};
  const forStyle: Record<string, PlanValue> = {};
  for (const [k, raw] of Object.entries(given ?? {})) {
    const md = moveDefs.find((d) => d.id === k);
    const sd = styleDefs?.find((d) => d.id === k);
    if (!md && !sd) {
      warnings.push(`${where}: param "${k}" is not used (${names.move} takes ${moveDefs.map((d) => d.id).join(', ') || 'none'}${names.style ? `; ${names.style} takes ${styleDefs?.map((d) => d.id).join(', ') || 'none'}` : ''}); left out`);
      continue;
    }
    const v = (md ?? sd)!.type === 'number' ? asNumber(raw) : raw;
    if (md && sd) {
      const toMove = fitsParam(md, v), toStyle = fitsParam(sd, v);
      if (toMove || !toStyle) forMove[k] = v; // fits the move, or fits neither: the move's own check clamps it
      if (toStyle) forStyle[k] = v;
      continue;
    }
    if (md) forMove[k] = v; else forStyle[k] = v;
  }
  return { forMove, forStyle };
}

/** Moves, params, texts and lengths checked against the catalogue (no song or clips needed); problems go to `errors`. */
export function resolvePlanSections(plan: ReelPlan, warnings: string[], errors: string[]) {
  const resolved = plan.sections.map((s, i) => {
    const where = `sections[${i}]`;
    const move = moveById(s.move);
    if (!move) { errors.push(`${where}: unknown move "${s.move}"`); return null; }
    const style = s.text ? textStyleById(s.textStyle ?? 'caption') : undefined;
    // section params feed the move and the section's text style (RS-1258: each gets the values it can use)
    const { forMove, forStyle } = splitSectionParams(s.params, move.params, style?.params, where, { move: move.id, ...(style ? { style: style.id } : {}) }, warnings);
    const params = resolveParams(move.params, forMove, where, errors, warnings);
    let beats = s.beats ?? move.beats.default;
    if (s.seconds !== undefined) beats = s.seconds / 0.5; // converted on the clock below
    if (s.beats !== undefined && (s.beats < move.beats.min || s.beats > move.beats.max)) {
      warnings.push(`${where} (${move.id}): ${s.beats} beats is outside ${move.beats.min}-${move.beats.max}; clamped.`);
      beats = Math.min(move.beats.max, Math.max(move.beats.min, s.beats));
    }
    if (s.text && !style) errors.push(`${where}: unknown textStyle "${s.textStyle}"`);
    if (s.transition && !directorTransitionById(s.transition) && !isCustomTransition(s.transition)) errors.push(`${where}: unknown transition "${s.transition}"${s.transition.startsWith('custom:') ? ' (custom shaders last for this session; register it again with reels_custom_shader)' : ''}`);
    if (s.look && !lookById(s.look)) errors.push(`${where}: unknown look "${s.look}"`);
    for (const e of s.effects ?? []) {
      const asset = effectAsset(e.id);
      if (!asset) { errors.push(`${where}: unknown effect "${e.id}"${e.id.startsWith('custom:') ? ' (custom shaders last for this session; register it again with reels_custom_shader)' : ''}`); continue; }
      const def = ALL_FX[asset]!;
      for (const [k, v] of Object.entries(e.params ?? {})) {
        const p = def.props.find((x) => x.key === k);
        // RS-1258: repaired, not refused: an unknown key is left out, a value out of range is clamped
        if (!p) { warnings.push(`${where}: effect ${asset} has no param "${k}" (it has ${def.props.map((x) => x.key).join(', ')}); left out`); delete e.params![k]; }
        else if ('min' in p && typeof p.min === 'number' && typeof p.max === 'number' && (v < p.min || v > p.max)) {
          const clamped = Math.min(p.max, Math.max(p.min, v));
          warnings.push(`${where}: ${asset}.${k} ${v} is outside ${p.min}-${p.max}; used ${clamped}`);
          e.params![k] = clamped;
        }
      }
    }
    for (const snd of s.sounds ?? []) if (!isLibrarySound(snd.id)) errors.push(`${where}: unknown sound "${snd.id}" (use a sound id from reels_director_options sounds)`);
    if (s.text && style && s.text.length > style.maxChars) errors.push(`${where}.text is longer than ${style.maxChars} characters for ${style.id}`);
    return { s, move, params, beats, style, textParams: style ? resolveParams(style.params, forStyle, where, errors, warnings) : {} };
  });
  // one custom effect and one custom transition per reel: a signature, not a different shader in every section
  const customFx = new Set(plan.sections.flatMap((s) => (s.effects ?? []).map((e) => e.id)).filter((x) => x.startsWith('custom:')));
  const customTr = new Set(plan.sections.map((s) => s.transition).filter((x): x is string => !!x && x.startsWith('custom:')));
  if (customFx.size > 1) errors.push(`use one custom effect per reel (the plan has ${customFx.size}); reuse it where the story returns to that idea`);
  if (customTr.size > 1) errors.push(`use one custom transition per reel (the plan has ${customTr.size})`);
  for (const o of plan.overlays ?? []) {
    const style = textStyleById(o.style);
    if (!style) errors.push(`overlay "${o.text}": unknown style "${o.style}"`);
    else if (o.text.length > style.maxChars) errors.push(`overlay "${o.text}" is longer than ${style.maxChars} characters for ${style.id}`);
  }
  checkGraphics(plan, errors, resolveParams);
  return { sections: resolved, customFx };
}
