#version 300 es
precision highp float;
precision highp int;

// Burn holes (Reels). Noisy holes burn through the shot from scattered spots: a white-hot core, a glowing orange band
// at the edge and a faint scorch beyond it, flickering like old film; it holds white, then the holes burn open onto the
// next shot. Vintage, film, a dramatic chapter change. Adapted from GTKottman/remotion-transitions "film-burn" (MIT).
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float HOLD = 0.04;
const vec3 GLOW = vec3(1.0, 0.416, 0.0);
const vec3 CORE = vec3(1.0, 0.957, 0.878);

vec2 hash2(vec2 p, float s) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p + s * 17.13) * 43758.5453);
}
float hash1(vec2 p, float s) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + s * 3.17) * 43758.5453); }
float noise(vec2 p, float s) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i, s), f), dot(hash2(i + vec2(1, 0), s), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1), s), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1), s), f - vec2(1, 1)), u.x), u.y) * 1.4;
}
float fbm(vec2 p, float s) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p, s + float(i) * 7.0); p = p * 2.03 + 11.0; a *= 0.5; }
  return v;
}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float cover(float sdf) { float aa = max(fwidth(sdf) * 0.75, 0.0006); return 1.0 - smoothstep(-aa, aa, sdf); }

// The burn over a scene at phase time t: returns the burnt picture.
vec3 burn(vec3 scene, vec2 p, float t, float seed, float flicker) {
  if (t <= 0.0) return scene;
  float sdf = 1e3;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(hash1(vec2(fi, 1.0), seed) * u_aspect, hash1(vec2(fi, 2.0), seed));
    float birth = hash1(vec2(fi, 3.0), seed) * 0.4;
    float s = clamp((t - birth) / (1.0 - birth), 0.0, 1.0);
    if (s <= 0.0) continue;
    float r = 1.5 * pow(s, 1.7);
    sdf = min(sdf, length(p - c) - r + fbm(p * 5.0 + fi, seed) * 0.12 * min(1.0, r * 4.0));
  }
  sdf -= smoothstep(0.85, 1.0, t) * 3.0;
  float core = cover(sdf);
  float fade = smoothstep(0.0, 0.05, t);
  float glow = exp(-max(sdf, 0.0) * 40.0) * step(-0.001, sdf) * fade;
  float scorch = exp(-max(sdf, 0.0) * 12.0) * 0.35 * fade;
  vec3 col = mix(vec3(0.08, 0.03, 0.0), CORE * flicker, core);
  float a = max(core, scorch * (1.0 - core));
  col = mix(col, GLOW * 1.2, glow * (1.0 - core));
  a = max(a, glow);
  return scene * (1.0 - a) + col * a;
}

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  float flicker = 0.93 + 0.07 * sin(floor(pr * 24.0) * 12.9898 + 1.0);
  float inEnd = 0.5 - HOLD / 2.0, outStart = 0.5 + HOLD / 2.0;
  vec3 col;
  if (pr < inEnd) col = burn(a, p, pr / inEnd, 1.0, flicker);
  else if (pr < outStart) col = CORE * flicker;
  else col = burn(b, p, 1.0 - (pr - outStart) / (1.0 - outStart), 2.0, flicker);
  if (pr >= 1.0) col = b;
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
