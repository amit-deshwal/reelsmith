// Reels effects (soft vignette, halation, pro-mist, anamorphic flare, light rays, zoom blur, lens distortion, film damage, VHS, cartoon, water
// ripple, cinema bars, swirl): registered in the library and for the agent, every shader uniform is fed, English names, sane
// defaults. Pixels are checked by server/reelsmith/fx-sheet.mts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_FX, FX_IDS } from './effects';
import { fxPasses, fxUniforms } from './uniforms';
import { REEL_FX_EFFECTS, REEL_FX_ORDER } from './reelFx';

const RUNTIME = new Set(['u_input', 'u_time', 'u_resolution', 'u_width', 'u_height']);
const SAMPLERS = new Set(['u_glow']);
const declared = (frag: string) => [...frag.matchAll(/^uniform\s+\w+\s+(u_\w+)/gm)].map((m) => m[1]!);
const source = (frag: string) => frag;

assert.equal(REEL_FX_ORDER.length, 14);
for (const id of REEL_FX_ORDER) {
  const def = REEL_FX_EFFECTS[id]!;
  assert.ok(def, `${id} defined`);
  assert.ok(id in ALL_FX && FX_IDS.includes(id), `${id} is in the library and the agent catalog`);
  assert.ok(!/[一-鿿]/.test(def.name + def.desc + def.props.map((p) => p.label).join('')), `${id}: English only`);
  assert.ok(def.desc.length > 40, `${id}: described`);
  for (const p of def.props) assert.ok(!RUNTIME.has(p.uniform ?? `u_${p.key}`), `${id}.${p.key} would collide with a uniform the runtime sets`);
  // defaults inside their ranges, unique keys
  const keys = new Set<string>();
  for (const p of def.props) {
    assert.ok(!keys.has(p.key), `${id}: duplicate prop ${p.key}`);
    keys.add(p.key);
    if (p.kind !== 'color') assert.ok(p.default >= p.min && p.default <= p.max, `${id}.${p.key} default inside [min, max]`);
  }
  // every pass: each declared uniform is supplied (by the effect's props, the pass, or the runtime)
  const passes = fxPasses([{ def }], 0);
  assert.ok(passes.length >= 1, `${id} has passes`);
  passes.forEach((pass, i) => {
    const frag = source(pass.frag);
    assert.match(frag, /^#version 300 es/, `${id}/pass ${i}: GLSL ES 3.0`);
    const given = new Set([...Object.keys(pass.uniforms ?? {}), ...Object.keys(pass.samplers ?? {})]);
    for (const name of declared(frag)) {
      if (RUNTIME.has(name) || SAMPLERS.has(name)) continue;
      assert.ok(given.has(name), `${id}/pass ${i}: uniform ${name} is not supplied`);
    }
    assert.ok(!/pow\(\s*sin\(/.test(frag), `${id}/pass ${i}: no pow(sin(..)) on a value that can dip below 0`);
    for (const key of Object.keys(pass.samplers ?? {})) assert.ok(pass.samplers![key]! < i, `${id}/pass ${i}: sampler ${key} reads an earlier pass`);
    if (pass.inputFrom !== undefined) assert.ok(pass.inputFrom < i, `${id}/pass ${i}: inputFrom reads an earlier pass`);
  });
  // single-pass effects: props and shader uniforms line up exactly (no dead sliders)
  if (!def.pipeline) {
    const fed = Object.keys(fxUniforms(def));
    const need = declared(def.frag).filter((n) => !RUNTIME.has(n));
    assert.deepEqual([...fed].sort(), [...need].sort(), `${id}: sliders and uniforms match`);
  } else {
    // pipeline effects: moving any slider to its far end changes some pass
    for (const p of def.props) {
      if (p.kind === 'color') continue;
      const to = p.default === p.max ? p.min : p.max;
      assert.notDeepEqual(fxPasses([{ def, overrides: { [p.key]: to } }], 0), passes, `${id}.${p.key} reaches a pass`);
    }
  }
}

// the sliders really change a multi-pass effect: halation radius changes the blur taps, strength reaches the composite
const halation = REEL_FX_EFFECTS['builtin:fx-halation']!;
const base = fxPasses([{ def: halation }], 0);
const wide = fxPasses([{ def: halation, overrides: { radius: 12 } }], 0);
assert.notDeepEqual(base[2]!.uniforms, wide[2]!.uniforms, 'spread changes the blur');
const strong = fxPasses([{ def: halation, overrides: { intensity: 2.5 } }], 0);
assert.equal(strong.at(-1)!.uniforms!.u_intensity, 2.5, 'strength reaches the composite pass');
assert.equal(base.at(-1)!.inputFrom, 0, 'the glow is composited over the untouched copy');
assert.equal(base.at(-1)!.samplers!.u_glow, base.length - 2, 'the glow comes from the last blur');

// shader twin files are current
for (const name of ['reel-blur', 'reel-extract', 'reel-rays', 'reel-vhs', 'reel-film-damage']) {
  const src = readFileSync(new URL(`./${name}.frag`, import.meta.url), 'utf8');
  const twin = readFileSync(new URL(`./${name}.frag.ts`, import.meta.url), 'utf8');
  assert.ok(twin.includes(JSON.stringify(src.replace(/\r\n?/g, '\n')).slice(1, 80)), `${name}: generated twin current`);
}
console.log('reelFx.verify ok');
