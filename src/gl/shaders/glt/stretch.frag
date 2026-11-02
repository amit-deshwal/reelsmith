#version 300 es
precision highp float;
precision highp int;

// Stretch (Reels). The shot is pulled tall from the middle until it smears into vertical light streaks and brightens;
// the next shot arrives just as stretched and snaps back to normal with a small overshoot. Fast beat cuts, sport,
// dance, a quick change of place.
// Reelsmith original, after the elastic stretch cut of mobile editors.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float MAX_STRETCH = 7.0;
const int TAPS = 9;

// the next shot snaps back: overshoot a little past normal, then settle
float snap(float t) {
  float c = 1.70158 * 1.3;
  float u = t - 1.0;
  return 1.0 + (c + 1.0) * u * u * u + c * u * u;
}

vec3 stretched(sampler2D tex, vec2 uv, float s, float smear) {
  // tall about the middle; a little narrower, as if the picture keeps its volume
  float sx = 1.0 / mix(1.0, 0.86, clamp((s - 1.0) / (MAX_STRETCH - 1.0), 0.0, 1.0));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float k = float(i) / float(TAPS - 1) - 0.5;
    vec2 q = vec2(0.5 + (uv.x - 0.5) / sx, 0.5 + (uv.y - 0.5) / s + k * smear);
    q = abs(mod(q + 1.0, 2.0) - 1.0);   // mirror at the edges instead of clamped smears
    acc += texture(tex, q).rgb;
  }
  return acc / float(TAPS);
}

void main() {
  vec2 uv = v_texCoord;
  float p = clamp(u_progress, 0.0, 1.0);
  vec3 col;
  if (p < 0.5) {
    float t = p / 0.5;
    float e = t * t * t;                       // slow start, fast into the cut
    float s = mix(1.0, MAX_STRETCH, e);
    col = stretched(u_outgoing, uv, s, 0.12 * e);
    col += 0.18 * e;
  } else {
    float t = (p - 0.5) / 0.5;
    float g = snap(t);                         // 0 → past 1 → 1
    float s = max(0.92, mix(MAX_STRETCH, 1.0, g));
    float left = 1.0 - clamp(t * 1.6, 0.0, 1.0);
    col = stretched(u_incoming, uv, s, 0.12 * left * left);
    col += 0.18 * left * left;
  }
  if (p <= 0.0) col = texture(u_outgoing, uv).rgb;
  if (p >= 1.0) col = texture(u_incoming, uv).rgb;
  fragColor = vec4(col, 1.0);
}
