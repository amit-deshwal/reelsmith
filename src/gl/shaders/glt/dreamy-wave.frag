#version 300 es
precision highp float;
precision highp int;

// Dreamy wave (Reels). The shot sways in soft waves and colour-fades into the next. Soft, romantic, golden-hour passages.
// Adapted from GL Transitions "Dreamy" (MIT, gl-transitions contributors): wrapped in the two-input contract,
// tunable uniforms fixed at their defaults. Regenerate with server/reelsmith/import-gl-transitions.mts.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

float progress;
float ratio;
vec4 getFromColor(vec2 uv) { return texture(u_outgoing, uv); }
vec4 getToColor(vec2 uv) { return texture(u_incoming, uv); }

// ---- GL Transitions source ----
// Author: mikolalysenko
// License: MIT
// Description: A crossfade with a gentle wavy distortion
// Tags: wave, blend

vec2 offset(float progress, float x, float theta) {
  float phase = progress*progress + progress + theta;
  float shifty = 0.03*progress*cos(10.0*(progress+x));
  return vec2(0, shifty);
}
vec4 transition(vec2 p) {
  return mix(getFromColor(p + offset(progress, p.x, 0.0)), getToColor(p + offset(1.0-progress, p.x, 3.14)), progress);
}

// ---- end ----

void main() {
  progress = u_progress;
  ratio = u_aspect;
  fragColor = vec4(transition(v_texCoord).rgb, 1.0);
}
