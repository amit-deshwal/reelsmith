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

// ---- Reelsmith polish: ease-in-out timing, motion blur over nearby moments, colour fringe along the motion ----
const float RS_BLUR = 0.0;
const float RS_SPLIT = 0.0;
const int RS_TAPS = 7;
float rs_ease(float p) { return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; }
float rs_speed(float p) { float q = min(p, 1.0 - p); return 4.0 * q * q; }   // the ease's slope, 1 at the middle
vec3 rs_at(float t) { progress = t; return transition(v_texCoord).rgb; }

void main() {
  ratio = u_aspect;
  float e = rs_ease(u_progress);
  float spread = RS_BLUR * rs_speed(u_progress);
  if (spread <= 0.0) { fragColor = vec4(rs_at(e), 1.0); return; }
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < RS_TAPS; i++) {
    float k = float(i) / float(RS_TAPS - 1) - 0.5;
    vec3 w = vec3(1.0 + RS_SPLIT * 2.0 * k, 1.0, 1.0 - RS_SPLIT * 2.0 * k);   // red leans ahead, blue behind
    acc += rs_at(clamp(e + k * spread, 0.0, 1.0)) * w;
    wsum += w;
  }
  fragColor = vec4(acc / wsum, 1.0);
}
