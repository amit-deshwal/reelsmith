#version 300 es
precision highp float;
precision highp int;

// Window slice (Reels). Vertical slats slide away to show the next shot. Architecture, clean modern edits.
// Adapted from GL Transitions "windowslice" (MIT, gl-transitions contributors): wrapped in the two-input contract,
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
// Author: gre
// License: MIT
// Description: The incoming image appears through vertical slices that widen
// Tags: slices, stripes, wipe

// @param Number of slices
const float count = 10.0;
// @param Softness of the slices' edges
const float smoothness = 0.5;

vec4 transition (vec2 p) {
  float pr = smoothstep(-smoothness, 0.0, p.x - progress * (1.0 + smoothness));
  float s = step(pr, fract(count * p.x));
  return mix(getFromColor(p), getToColor(p), s);
}

// ---- end ----

// ---- Reelsmith polish: ease-in-out timing, motion blur over nearby moments, colour fringe along the motion ----
const float RS_BLUR = 0.3;
const float RS_SPLIT = 0.7;
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
