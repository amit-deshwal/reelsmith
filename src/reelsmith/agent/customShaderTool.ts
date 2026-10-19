// RS-1205: the director writes its own effect or transition when nothing in the catalogue fits the story (Cardboard's
// agent writes shaders the same way). The agent sends GLSL it wrote itself; this checks it against the runtime's contract,
// compiles it in the editor's WebGL, and registers it so a plan can name it: an effect id in a section's `effects`, a
// transition id as a section's `transition`. Nothing here calls another model.
import { buildCustomFxDef, buildCustomTransitionDef, compileCheck } from '../../agent/tools/shader-tools';
import { registerCustomTransition } from '../../gl/customTransitions';
import type { FxDef } from '../../gl/fx/uniforms';

const MAX_GLSL = 20000;
/** custom shaders a session may register: enough for a revision or two, not a shader per section */
const MAX_PER_SESSION = 6;
let registered = 0;

export const EFFECT_CONTRACT = `#version 300 es
precision highp float;
uniform sampler2D u_input;   // the clip's frame (premultiplied RGBA)
uniform float u_time;        // seconds since the clip started
uniform vec2 u_resolution;   // pixels
uniform float u_aspect;      // width / height
uniform float u_<param>;     // one per declared param
in vec2 v_texCoord;          // 0..1, (0,0) bottom-left
out vec4 fragColor;`;

export const TRANSITION_CONTRACT = `#version 300 es
precision highp float;
uniform sampler2D u_outgoing; // the clip leaving
uniform sampler2D u_incoming; // the clip arriving
uniform float u_progress;     // 0 = all outgoing .. 1 = all incoming (must match both ends exactly)
uniform vec2 u_resolution;
uniform float u_aspect;
uniform float u_time;
uniform float u_<param>;
in vec2 v_texCoord;
out vec4 fragColor;`;

/** Plain-words problems with an agent's shader against the contract, or null. */
export function checkShader(kind: 'effect' | 'transition', glsl: string): string | null {
  const src = glsl.trim();
  if (!src) return 'glsl is empty';
  if (src.length > MAX_GLSL) return `glsl is ${src.length} characters; keep it under ${MAX_GLSL}`;
  if (!src.startsWith('#version 300 es')) return 'start with "#version 300 es" then "precision highp float;"';
  if (/#\s*(include|import|pragma\s+import)/.test(src)) return 'no #include or #import';
  if (!/\bvoid\s+main\s*\(/.test(src)) return 'missing void main()';
  if (!/\bfragColor\b/.test(src)) return 'write the colour to fragColor';
  const samplers = [...src.matchAll(/\buniform\s+sampler2D\s+(\w+)/g)].map((m) => m[1]!);
  const allowed = kind === 'effect' ? ['u_input'] : ['u_outgoing', 'u_incoming'];
  const extra = samplers.filter((n) => !allowed.includes(n));
  if (extra.length) return `only ${allowed.join(' and ')} can be sampled (got ${extra.join(', ')})`;
  for (const need of kind === 'effect' ? ['u_input'] : ['u_outgoing', 'u_incoming', 'u_progress']) if (!src.includes(need)) return `the shader must use ${need}`;
  if (/\bMath\.|\bDate\b/.test(src)) return 'GLSL only: no JavaScript';
  return null;
}

interface RawParam { key?: unknown; label?: unknown; default?: unknown; min?: unknown; max?: unknown }

export async function customShaderTool(args: Record<string, unknown>): Promise<unknown> {
  const kind = args.type === 'transition' ? 'transition' : args.type === 'effect' ? 'effect' : null;
  if (!kind) return { error: 'type must be "effect" (a look on a section\'s footage) or "transition" (how a section comes in)' };
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 40) : '';
  if (!name) return { error: 'name is required: what it looks like in two or three words' };
  const glsl = typeof args.glsl === 'string' ? args.glsl.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim() : '';
  const params = Array.isArray(args.params) ? (args.params as RawParam[]) : [];
  const problem = checkShader(kind, glsl);
  if (problem) return { error: problem, contract: kind === 'effect' ? EFFECT_CONTRACT : TRANSITION_CONTRACT };
  const undeclared = params.filter((p) => typeof p.key === 'string' && !glsl.includes(`u_${p.key}`)).map((p) => p.key);
  if (undeclared.length) return { error: `params not used in the shader as u_<key>: ${undeclared.join(', ')}` };
  if (registered >= MAX_PER_SESSION) return { error: `already ${MAX_PER_SESSION} custom shaders this session; reuse one of them or the catalogue` };
  const compileError = compileCheck(glsl);
  if (compileError) return { error: `the shader does not compile: ${compileError.trim()}`, contract: kind === 'effect' ? EFFECT_CONTRACT : TRANSITION_CONTRACT };
  registered += 1;
  if (kind === 'transition') {
    const def = buildCustomTransitionDef(name, glsl, params);
    registerCustomTransition(def);
    return { ok: true, transitionId: def.id, params: def.props.map((p) => ({ id: p.key, default: p.default, min: p.min, max: p.max })), next: `Use it as a section's "transition": "${def.id}" in reels_director_build, then look at a frame inside the cut.` };
  }
  const def: FxDef = { ...buildCustomFxDef(name, glsl, params), desc: typeof args.looks === 'string' ? args.looks.slice(0, 200) : name };
  const { registerCustomFx } = await import('../../gl/fx/effects');
  registerCustomFx(def);
  return { ok: true, effectId: def.id, params: def.props.map((p) => ({ id: p.key, default: p.default, ...('min' in p ? { min: p.min, max: p.max } : {}) })), next: `Use it in a section's "effects": [{ "id": "${def.id}", "timing": "beat" }] in reels_director_build, then look at a frame of that section.` };
}

/** Test seam. */
export function __resetCustomShaderCount(): void { registered = 0; }
