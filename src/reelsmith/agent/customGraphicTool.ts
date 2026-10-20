// RS-1213: the director writes its own animated graphic when the catalogue has nothing for the story (an animated
// altitude profile of the trek, a hand-drawn sun that rises with the title, a scoreboard for a match). The agent sends a
// Remotion component it wrote; this checks it against the template sandbox (src/template-host.ts), compiles it, and
// registers it so a plan can place it like any catalogue graphic: plan.graphics[].graphic = "custom:gfx-<name>".
import { prepareTemplate, validateTemplate } from '../../template-host';
import { customGraphicId, listCustomGraphics, registerCustomGraphic } from '../director/customGraphics';
import type { MoveParam } from '../director/moveKit';

const MAX_CODE = 30000;
/** custom graphics a session may register: enough for a revision or two */
const MAX_PER_SESSION = 6;
let registered = 0;

export const GRAPHIC_CONTRACT = `const MyGraphic = ({ item }) => { ...; return React.createElement(AbsoluteFill, null, ...); };
Globals only (no import/export): React, useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing, random, AbsoluteFill, Sequence.
item.width/item.height = the reel's frame (1080x1920 for 9:16). useCurrentFrame() counts from the graphic's start; t = frame / fps.
item.props: items (the plan's text split on "/"), beats (seconds of each song beat from the start), sections (seconds where each
spanned section starts), total (length in seconds), plus each declared param. Pure and deterministic: everything from t.
Transparent background unless the graphic is meant to cover the frame; keep words inside x 6-84%, y 12-75% (Instagram's buttons).
Forbidden: fetch, window, document, timers, eval, new Function, loops without an end, network or storage.`;

interface RawParam { key?: unknown; label?: unknown; default?: unknown; min?: unknown; max?: unknown }

/** Declared params as the director's param defs: numbers with a range, or a colour / text by their default. */
function paramDefs(raw: RawParam[]): MoveParam[] | string {
  const out: MoveParam[] = [];
  for (const p of raw) {
    if (typeof p.key !== 'string' || !/^[a-z][a-zA-Z0-9]{0,23}$/.test(p.key)) return `param keys are short camelCase words (got ${JSON.stringify(p.key)})`;
    if (['items', 'beats', 'sections', 'total'].includes(p.key)) return `"${p.key}" is given to every graphic; pick another param name`;
    const label = typeof p.label === 'string' ? p.label.slice(0, 60) : p.key;
    if (typeof p.default === 'number') out.push({ id: p.key, type: 'number', label, default: p.default, min: typeof p.min === 'number' ? p.min : Math.min(0, p.default), max: typeof p.max === 'number' ? p.max : Math.max(1, p.default) });
    else if (typeof p.default === 'string' && /^#[0-9a-f]{6}$/i.test(p.default)) out.push({ id: p.key, type: 'color', label, default: p.default });
    else if (typeof p.default === 'string') out.push({ id: p.key, type: 'text', label, default: p.default.slice(0, 80) });
    else if (typeof p.default === 'boolean') out.push({ id: p.key, type: 'boolean', label, default: p.default });
    else return `param ${p.key} needs a default (a number, a #rrggbb colour, text or true/false)`;
  }
  return out;
}

export async function customGraphicTool(args: Record<string, unknown>): Promise<unknown> {
  const name = typeof args.name === 'string' ? args.name.trim().slice(0, 40) : '';
  if (!name) return { error: 'name is required: what it is in two or three words' };
  const code = typeof args.code === 'string' ? args.code.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim() : '';
  if (!code) return { error: 'code is empty', contract: GRAPHIC_CONTRACT };
  if (code.length > MAX_CODE) return { error: `code is ${code.length} characters; keep it under ${MAX_CODE}` };
  if (!/const\s+[A-Za-z_$][\w$]*\s*=\s*\(\s*\{\s*item\s*\}\s*\)\s*=>/.test(code)) return { error: 'the code must be one component: const Name = ({ item }) => { ... }', contract: GRAPHIC_CONTRACT };
  if (!/useCurrentFrame\s*\(/.test(code)) return { error: 'a graphic must move: read useCurrentFrame() and animate from it', contract: GRAPHIC_CONTRACT };
  const params = paramDefs(Array.isArray(args.params) ? args.params as RawParam[] : []);
  if (typeof params === 'string') return { error: params };
  try { validateTemplate(code); } catch (e) { return { error: `the sandbox refuses it: ${e instanceof Error ? e.message : String(e)}`, contract: GRAPHIC_CONTRACT }; }
  try { await prepareTemplate(code); } catch (e) { return { error: `the code does not compile: ${e instanceof Error ? e.message : String(e)}`, contract: GRAPHIC_CONTRACT }; }
  const id = customGraphicId(name);
  if (!listCustomGraphics().some((g) => g.id === id)) {
    if (registered >= MAX_PER_SESSION) return { error: `already ${MAX_PER_SESSION} custom graphics this session; reuse one of them or the catalogue` };
    registered += 1;
  }
  registerCustomGraphic({ id, name, looks: typeof args.looks === 'string' ? args.looks.slice(0, 200) : name, code, params });
  return {
    ok: true, graphicId: id, params: params.map((p) => ({ id: p.id, default: p.default })),
    next: `Place it in the plan: "graphics": [{ "graphic": "${id}", "from": <section>, "to": <section>, "text": "...", "params": {...} }] in reels_director_build, then check that section's frame in the review.`,
  };
}

/** Test seam. */
export function __resetCustomGraphicCount(): void { registered = 0; }
