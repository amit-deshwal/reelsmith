#version 300 es
precision highp float;
precision highp int;

// Hexagons (Reels). The shot breaks into hexagon cells that swap to the next shot. Tech, sci-fi, a clean digital cut.
// Adapted from GL Transitions "hexagonalize" (MIT, gl-transitions contributors): wrapped in the two-input contract,
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
// Description: Both images turn into hexagons, crossfade, then sharpen again
// Tags: pixelate, hexagon, blend
// Hexagonal math from: http://www.redblobgames.com/grids/hexagons/

const int steps = 50;
// @param Number of hexagons across
const float horizontalHexagons = 20.0;

struct Hexagon {
  float q;
  float r;
  float s;
};

Hexagon createHexagon(float q, float r){
  Hexagon hex;
  hex.q = q;
  hex.r = r;
  hex.s = -q - r;
  return hex;
}

Hexagon roundHexagon(Hexagon hex){
  
  float q = floor(hex.q + 0.5);
  float r = floor(hex.r + 0.5);
  float s = floor(hex.s + 0.5);

  float deltaQ = abs(q - hex.q);
  float deltaR = abs(r - hex.r);
  float deltaS = abs(s - hex.s);

  if (deltaQ > deltaR && deltaQ > deltaS)
    q = -r - s;
  else if (deltaR > deltaS)
    r = -q - s;
  else
    s = -q - r;

  return createHexagon(q, r);
}

Hexagon hexagonFromPoint(vec2 point, float size) {
  
  point.y /= ratio;
  point = (point - 0.5) / size;
  
  float q = (sqrt(3.0) / 3.0) * point.x + (-1.0 / 3.0) * point.y;
  float r = 0.0 * point.x + 2.0 / 3.0 * point.y;

  Hexagon hex = createHexagon(q, r);
  return roundHexagon(hex);
  
}

vec2 pointFromHexagon(Hexagon hex, float size) {
  
  float x = (sqrt(3.0) * hex.q + (sqrt(3.0) / 2.0) * hex.r) * size + 0.5;
  float y = (0.0 * hex.q + (3.0 / 2.0) * hex.r) * size + 0.5;
  
  return vec2(x, y * ratio);
}

vec4 transition (vec2 uv) {
  
  float dist = 2.0 * min(progress, 1.0 - progress);
  dist = steps > 0 ? ceil(dist * float(steps)) / float(steps) : dist;
  
  float size = (sqrt(3.0) / 3.0) * dist / horizontalHexagons;
  
  vec2 point = dist > 0.0 ? pointFromHexagon(hexagonFromPoint(uv, size), size) : uv;

  return mix(getFromColor(point), getToColor(point), progress);
  
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
