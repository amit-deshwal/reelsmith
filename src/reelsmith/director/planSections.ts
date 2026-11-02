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

/** Params with defaults filled and values checked against the move's (or text style's) declared params. */
export function resolveParams(defs: readonly MoveParam[], given: Record<string, PlanValue> | undefined, where: string, errors: string[]): Record<string, PlanValue> {
  const out: Record<string, PlanValue> = Object.fromEntries(defs.map((d) => [d.id, d.default]));
  for (const [k, v] of Object.entries(given ?? {})) {
    const d = defs.find((x) => x.id === k);
    if (!d) { errors.push(`${where}: unknown param "${k}" (allowed: ${defs.map((x) => x.id).join(', ') || 'none'})`); continue; }
    if (d.type === 'number' && (typeof v !== 'number' || (d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))) { errors.push(`${where}.${k} must be a number from ${d.min} to ${d.max}`); continue; }
    if (d.type === 'boolean' && typeof v !== 'boolean') { errors.push(`${where}.${k} must be true or false`); continue; }
    if (d.type === 'enum' && !d.options?.includes(String(v))) { errors.push(`${where}.${k} must be one of ${d.options?.join(', ')}`); continue; }
    if (d.type === 'color' && !(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) { errors.push(`${where}.${k} must be a colour like #ff0000`); continue; }
    if (d.type === 'text' && typeof v !== 'string') { errors.push(`${where}.${k} must be text`); continue; }
    out[k] = v;
  }
  return out;
}

/** Moves, params, texts and lengths checked against the catalogue (no song or clips needed); problems go to `errors`. */
export function resolvePlanSections(plan: ReelPlan, warnings: string[], errors: string[]) {
  const resolved = plan.sections.map((s, i) => {
    const where = `sections[${i}]`;
    const move = moveById(s.move);
    if (!move) { errors.push(`${where}: unknown move "${s.move}"`); return null; }
    const style = s.text ? textStyleById(s.textStyle ?? 'caption') : undefined;
    // section params feed the move and the section's text style; a key neither knows is a mistake
    const own = (defs: readonly MoveParam[]) => Object.fromEntries(Object.entries(s.params ?? {}).filter(([k]) => defs.some((d) => d.id === k)));
    for (const k of Object.keys(s.params ?? {})) {
      if (!move.params.some((d) => d.id === k) && !style?.params.some((d) => d.id === k)) errors.push(`${where}: unknown param "${k}" (${move.id} takes ${move.params.map((d) => d.id).join(', ') || 'none'}${style ? `; ${style.id} takes ${style.params.map((d) => d.id).join(', ') || 'none'}` : ''})`);
    }
    const params = resolveParams(move.params, own(move.params), where, errors);
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
        if (!p) errors.push(`${where}: effect ${asset} has no param "${k}" (it has ${def.props.map((x) => x.key).join(', ')})`);
        else if ('min' in p && typeof p.min === 'number' && typeof p.max === 'number' && (v < p.min || v > p.max)) errors.push(`${where}: ${asset}.${k} must be ${p.min} to ${p.max}`);
      }
    }
    for (const snd of s.sounds ?? []) if (!isLibrarySound(snd.id)) errors.push(`${where}: unknown sound "${snd.id}" (use a sound id from reels_director_options sounds)`);
    if (s.text && style && s.text.length > style.maxChars) errors.push(`${where}.text is longer than ${style.maxChars} characters for ${style.id}`);
    return { s, move, params, beats, style, textParams: style ? resolveParams(style.params, own(style.params), where, errors) : {} };
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
