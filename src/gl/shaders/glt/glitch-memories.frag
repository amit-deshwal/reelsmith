#version 300 es
precision highp float;
precision highp int;

// Glitch memories (Reels). Blocky colour-split glitch tears one shot into the next. Tech, night, flashbacks with an edge.
// Adapted from GL Transitions "GlitchMemories" (MIT, gl-transitions contributors): wrapped in the two-input contract,
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
// Author: Gunnar Roth
// based on work from natewave
// License: MIT
// Description: A crossfade with glitchy, color-shifted blocks
// Tags: glitch, chromatic, blend
vec4 transition(vec2 p) {
  vec2 block = floor(p.xy / vec2(16));
  vec2 uv_noise = block / vec2(64);
  uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64);
  vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 *(1.0 -progress) : vec2(0.0);
  vec2 red = p + dist * 0.2;
  vec2 green = p + dist * .3;
  vec2 blue = p + dist * .5;

  return vec4(mix(getFromColor(red), getToColor(red), progress).r,mix(getFromColor(green), getToColor(green), progress).g,mix(getFromColor(blue), getToColor(blue), progress).b,1.0);
}


// ---- end ----

void main() {
  progress = u_progress;
  ratio = u_aspect;
  fragColor = vec4(transition(v_texCoord).rgb, 1.0);
}
