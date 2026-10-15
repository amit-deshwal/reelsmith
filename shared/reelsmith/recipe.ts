// RS-101: recipe manifest types, validation and loader helpers.
// Recipes are declarative JSON. Validation = JSON Schema (structure) + semantic checks (cross references, templates).
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import { RECIPE_SCHEMA } from './recipe-schema';

export type RecipeParamType = 'number' | 'integer' | 'boolean' | 'enum' | 'color' | 'font' | 'seconds';

export interface RecipeMediaInput {
  id: string; kind: 'media'; accept: Array<'video' | 'image' | 'audio'>;
  min: number; max: number; label: string; hint?: string;
  constraints?: { minClipSec?: number; preferOrientation?: 'portrait' | 'landscape' | 'any'; requiresSpeech?: boolean };
}
export interface RecipeTextInput {
  id: string; kind: 'text'; label: string; placeholder?: string; optional?: boolean; maxLength?: number;
}
export type RecipeInput = RecipeMediaInput | RecipeTextInput;

export interface RecipeParam {
  id: string; type: RecipeParamType; label: string; default: unknown;
  min?: number; max?: number; step?: number; options?: Array<string | number>; agentEditable?: boolean;
}

export interface RecipeOverlay {
  kind: 'title' | 'label' | 'captions' | 'timestamp' | 'placeName';
  text?: string; styleId?: string; animationIn?: string; position?: string; atBeat?: number; durationBeats?: number;
}

export interface RecipeSection {
  section: string; lengthBeats?: number; lengthSec?: number;
  fill?: 'none' | 'clips' | 'photos' | 'speech' | 'layout';
  cutRule?: 'everyBeat' | 'every2Beats' | 'everyBar' | 'onSpeechPhrases' | 'fixedSec';
  shotSec?: [number, number]; layout?: string; transition?: string; overlays?: RecipeOverlay[];
}

export interface Recipe {
  schemaVersion: 1; id: string; version: string; name: string;
  category: 'travel' | 'vlog' | 'beat-cut' | 'captioned-story' | 'collage' | 'other';
  description?: string; tags?: string[];
  preview?: { poster?: string; loop?: string; generatedFrom?: 'synthetic-sample' | 'user-footage' };
  canvas: { width: number; height: number; fps: { num: number; den: number } };
  duration?: { mode?: 'fitMusic' | 'fixed' | 'fitContent'; minSec?: number; targetSec?: number; maxSec?: number };
  inputs: RecipeInput[]; params: RecipeParam[];
  music?: {
    inputId?: string; required?: boolean; startPolicy?: string; endPolicy?: string;
    fadeOutSec?: number; gainDb?: number; clipAudioGainDb?: number; duckUnderSpeech?: boolean;
  };
  assembler: { strategy: 'beat-montage@1' | 'story-vlog@1' | 'captioned-story@1' | 'collage-grid@1'; options?: Record<string, unknown>; aiSelection?: 'off' | 'optional' | 'recommended' };
  structure: RecipeSection[];
  styles: Record<string, Record<string, unknown>>;
  look?: { colorLook?: string; grain?: number; vignette?: number };
  agentHints?: string;
  constraints?: { noRepeatClips?: boolean; insufficientMediaPolicy?: 'lengthenShots' | 'askUser' | 'allowRepeat'; keepChronological?: boolean; textSafeZone?: boolean };
}

export type RecipeValidation =
  | { ok: true; recipe: Recipe }
  | { ok: false; errors: string[] };

const TEMPLATE = /\{\{([^{}]*)\}\}/g;
const TEMPLATE_REF = /^(inputs|params)\.([a-z][a-zA-Z0-9_]*)$/;

let validator: ReturnType<Ajv2020['compile']> | null = null;
function schemaValidator() {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validator = ajv.compile(RECIPE_SCHEMA as unknown as object);
  }
  return validator;
}

function formatAjvError(e: ErrorObject): string {
  return `${e.instancePath || '/'} ${e.message ?? 'invalid'}`;
}

/** Collect every string leaf with its JSON path, so templates are checked anywhere in the manifest. */
function stringLeaves(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => stringLeaves(v, `${path}/${i}`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringLeaves(v, `${path}/${k}`, out);
  }
}

function semanticErrors(r: Recipe): string[] {
  const errors: string[] = [];
  const inputIds = new Set<string>();
  const paramIds = new Set<string>();
  for (const i of r.inputs) {
    if (inputIds.has(i.id)) errors.push(`duplicate input id "${i.id}"`);
    inputIds.add(i.id);
    if (i.kind === 'media' && i.min > i.max) errors.push(`input "${i.id}": min > max`);
  }
  for (const p of r.params) {
    if (paramIds.has(p.id)) errors.push(`duplicate param id "${p.id}"`);
    paramIds.add(p.id);
    if (p.type === 'enum') {
      if (!p.options?.length) errors.push(`param "${p.id}": enum needs options`);
      else if (!p.options.includes(p.default as string | number)) errors.push(`param "${p.id}": default not in options`);
    }
    if ((p.type === 'number' || p.type === 'integer' || p.type === 'seconds') && typeof p.default === 'number') {
      if (p.min !== undefined && p.default < p.min) errors.push(`param "${p.id}": default below min`);
      if (p.max !== undefined && p.default > p.max) errors.push(`param "${p.id}": default above max`);
    }
    if (p.type === 'boolean' && typeof p.default !== 'boolean') errors.push(`param "${p.id}": default must be boolean`);
  }
  if (r.music?.inputId) {
    const m = r.inputs.find((i) => i.id === r.music!.inputId);
    if (!m) errors.push(`music.inputId "${r.music.inputId}" is not an input`);
    else if (m.kind !== 'media' || !m.accept.includes('audio')) errors.push(`music.inputId "${m.id}" must accept audio`);
  }
  const styleIds = new Set(Object.keys(r.styles));
  const sections = new Set<string>();
  for (const [si, s] of r.structure.entries()) {
    if (sections.has(s.section)) errors.push(`duplicate section "${s.section}"`);
    sections.add(s.section);
    for (const [oi, o] of (s.overlays ?? []).entries()) {
      if (o.styleId && !styleIds.has(o.styleId)) errors.push(`structure/${si}/overlays/${oi}: unknown styleId "${o.styleId}"`);
    }
  }
  // Templates: only {{inputs.X}} / {{params.X}} of declared ids, anywhere in the manifest.
  const leaves: Array<[string, string]> = [];
  stringLeaves(r, '', leaves);
  for (const [path, text] of leaves) {
    for (const m of text.matchAll(TEMPLATE)) {
      const ref = TEMPLATE_REF.exec(m[1]!);
      if (!ref) { errors.push(`${path}: template "{{${m[1]}}}" not allowed`); continue; }
      const known = ref[1] === 'inputs' ? inputIds : paramIds;
      if (!known.has(ref[2]!)) errors.push(`${path}: template refers to unknown ${ref[1]} "${ref[2]}"`);
    }
    const stripped = text.replace(TEMPLATE, '');
    if (/\{\{|\}\}/.test(stripped)) errors.push(`${path}: unbalanced template braces`);
  }
  return errors;
}

export function validateRecipe(data: unknown): RecipeValidation {
  const validate = schemaValidator();
  if (!validate(data)) return { ok: false, errors: (validate.errors ?? []).map(formatAjvError) };
  const recipe = data as unknown as Recipe;
  const errors = semanticErrors(recipe);
  return errors.length ? { ok: false, errors } : { ok: true, recipe };
}

/** Parse JSON text and validate. Never throws. */
export function parseRecipe(text: string): RecipeValidation {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] }; }
  return validateRecipe(data);
}
