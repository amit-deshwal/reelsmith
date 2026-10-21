#version 300 es
precision highp float;
precision highp int;

// Rotate fade (Reels). The shot rotates and scales while fading into the next. Lively, playful and dreamy cuts.
// Adapted from GL Transitions "rotate_scale_fade" (MIT, gl-transitions contributors): wrapped in the two-input contract,
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
// Author: Fernando Kuteken
// License: MIT
// Description: The outgoing image spins and zooms while fading to the incoming one, over a background color
// Tags: rotate, zoom, fade

#define PI 3.14159265359

// @param Center of the rotation
const vec2 center = vec2(0.5, 0.5);
// @param Number of turns
const float rotations = 1.0;
// @param Maximum zoom
const float scale = 8.0;
// @color Background color
const vec4 backColor = vec4(0.15, 0.15, 0.15, 1.0);

vec4 transition (vec2 uv) {
  
  vec2 difference = uv - center;
  vec2 dir = normalize(difference);
  float dist = length(difference);
  
  float angle = 2.0 * PI * rotations * progress;
  
  float c = cos(angle);
  float s = sin(angle);
  
  float currentScale = mix(scale, 1.0, 2.0 * abs(progress - 0.5));
  
  vec2 rotatedDir = vec2(dir.x  * c - dir.y * s, dir.x * s + dir.y * c);
  vec2 rotatedUv = center + rotatedDir * dist / currentScale;
  
  if (rotatedUv.x < 0.0 || rotatedUv.x > 1.0 ||
      rotatedUv.y < 0.0 || rotatedUv.y > 1.0)
    return backColor;
    
  return mix(getFromColor(rotatedUv), getToColor(rotatedUv), progress);
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
