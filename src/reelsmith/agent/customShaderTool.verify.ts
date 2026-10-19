import assert from 'node:assert/strict';
import { checkShader, customShaderTool, __resetCustomShaderCount } from './customShaderTool';
import { parsePlan, type ReelPlan } from '../../../shared/reelsmith/directorPlan';
import { assemble, type AssemblyClip, type AssemblyMusic } from '../assembler';
import { directorRecipe } from '../director/assembleDirector';

const EFFECT = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_time;
uniform float u_burn;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_input, v_texCoord);
  float edge = smoothstep(u_burn - 0.05, u_burn, v_texCoord.y + 0.05 * sin(v_texCoord.x * 40.0 + u_time));
  fragColor = vec4(mix(c.rgb, vec3(1.0, 0.45, 0.1) * c.a, edge * 0.6), c.a);
}`;
const TRANSITION = `#version 300 es
precision highp float;
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  float m = step(v_texCoord.x, u_progress);
  fragColor = mix(texture(u_outgoing, v_texCoord), texture(u_incoming, v_texCoord), m);
}`;

// the contract, in plain words
assert.equal(checkShader('effect', EFFECT), null);
assert.equal(checkShader('transition', TRANSITION), null);
assert.match(checkShader('effect', 'void main() { fragColor = vec4(1.0); }')!, /#version 300 es/);
assert.match(checkShader('effect', EFFECT.replace('uniform float u_time;', 'uniform sampler2D u_other;'))!, /only u_input/);
assert.match(checkShader('transition', TRANSITION.replace(/u_progress/g, 'u_p'))!, /u_progress/);
assert.match(checkShader('effect', EFFECT.replace('#version 300 es', '#version 300 es\n#include "x"'))!, /#include/);

// registering (compiles in the editor; under node the static check stands in)
__resetCustomShaderCount();
assert.ok(((await customShaderTool({ type: 'effect', name: 'x', glsl: EFFECT, params: [{ key: 'missing' }] })) as { error: string }).error.includes('missing'));
const fx = await customShaderTool({ type: 'effect', name: 'Ember edge', glsl: '```glsl\n' + EFFECT + '\n```', params: [{ key: 'burn', default: 0.5, min: 0, max: 1 }] }) as { effectId: string };
assert.match(fx.effectId, /^custom:fx-ember-edge-/);
const tr = await customShaderTool({ type: 'transition', name: 'Hard wipe', glsl: TRANSITION }) as { transitionId: string };
assert.match(tr.transitionId, /^custom:tr-hard-wipe-/);

// a plan that uses them: the effect with a beat timing, the transition between sections, the shader saved into the project
const clip = (id: string): AssemblyClip => ({ assetId: id, name: id, src: `/media/${id}.mp4`, kind: 'video', width: 1080, height: 1920, durationInFrames: 300, score: 0.5 });
const music: AssemblyMusic = { assetId: 'song', name: 'song', src: '/song.mp3', durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 };
const parsed = parsePlan({ music: 'song', sections: [
  { move: 'cut', beats: 4, clips: ['a', 'b'] },
  { move: 'hold', beats: 4, clips: ['c'], transition: tr.transitionId, effects: [{ id: fx.effectId, timing: 'beat', params: { burn: 0.7 } }] },
] });
assert.ok(parsed.ok);
const plan = (parsed as { plan: ReelPlan }).plan;
const res = assemble({ recipe: directorRecipe(plan), clips: ['a', 'b', 'c'].map(clip), music, texts: {}, params: {}, seed: 1, plan });
assert.ok(res.action, res.report.warnings.join('; '));
const acts = res.action!.actions as any[];
const held = acts.find((a) => a.type === 'add' && a.item.props?.rsSection === '2-hold' && a.item.kind === 'video');
const custom = held.item.effects.find((e: { assetId: string }) => e.assetId === fx.effectId);
assert.equal(custom.overrides.burn, 0.7);
assert.ok(custom.mix.hits.length >= 3, 'punches on the beat');
const snap = acts.find((a) => a.type === 'setEffects');
assert.equal(snap.defs[0].id, fx.effectId);
assert.ok(snap.defs[0].frag.includes('u_burn'));
const trans = acts.find((a) => a.type === 'addTransition');
assert.equal(trans.transType, 'custom-shader');
assert.ok(trans.custom.frag.includes('u_progress'));
assert.ok(acts.some((a) => a.type === 'add' && a.item.props?.rsSfx === 'whoosh-soft'), 'a custom transition still gets a sound');
// two different custom effects in one reel are refused; an unknown custom id explains itself
const two = await customShaderTool({ type: 'effect', name: 'Second', glsl: EFFECT, params: [{ key: 'burn' }] }) as { effectId: string };
const p2 = parsePlan({ sections: [{ move: 'hold', beats: 4, effects: [{ id: fx.effectId }] }, { move: 'hold', beats: 4, effects: [{ id: two.effectId }] }] });
const r2 = assemble({ recipe: directorRecipe((p2 as { plan: ReelPlan }).plan), clips: ['a', 'b'].map(clip), texts: {}, params: {}, seed: 1, plan: (p2 as { plan: ReelPlan }).plan });
assert.match(r2.report.warnings.join(' '), /one custom effect per reel/);
const p3 = parsePlan({ sections: [{ move: 'hold', beats: 4, effects: [{ id: 'custom:fx-gone-1234' }] }] });
const r3 = assemble({ recipe: directorRecipe((p3 as { plan: ReelPlan }).plan), clips: ['a'].map(clip), texts: {}, params: {}, seed: 1, plan: (p3 as { plan: ReelPlan }).plan });
assert.match(r3.report.warnings.join(' '), /register it again with reels_custom_shader/);
console.log('customShaderTool: ok');
