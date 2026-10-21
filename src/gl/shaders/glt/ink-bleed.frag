#version 300 es
precision highp float;
precision highp int;

// Ink bleed (Reels). Drops of blue-black ink land and spread with fibrous edges until the screen is covered,
// hold, then the next shot bleeds back through new drops. A section break; art, handmade or luxe stories.
// Adapted from GTKottman/remotion-transitions "ink-bleed" (MIT).
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 INK = vec3(0.055, 0.06, 0.1);   // blue-black ink
const float HOLD = 0.1;   // share of the transition fully covered
const int DROPS = 4;

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


// Ink coverage at phase time t (0..1): drops race out then slow, as ink soaking into paper; a faint halo is the bleed.
float ink(vec2 p, float t, float seed) {
  float sdf = 1e3;
  for (int i = 0; i < DROPS; i++) {
    float fi = float(i);
    vec2 c = vec2(hash1(vec2(fi, 1.0), seed) * u_aspect * 0.8 + u_aspect * 0.1, hash1(vec2(fi, 2.0), seed) * 0.8 + 0.1);
    float birth = fi / float(DROPS) * 0.45;
    float s = clamp((t - birth) / (1.0 - birth), 0.0, 1.0);
    if (s <= 0.0) continue;
    float r = 1.35 * s * s * (0.8 + 0.4 * hash1(vec2(fi, 3.0), seed));
    float n = fbm(p * 4.0 + fi, seed) * 0.09 + noise(p * 60.0, seed + fi) * 0.012;
    sdf = smin(sdf, length(p - c) - r + n * min(r * 3.0, 1.0), 0.06);
  }
  sdf -= smoothstep(0.88, 1.0, t) * 3.0;
  if (t <= 0.0) return 0.0;
  return max(cover(sdf), 0.28 * cover(sdf - 0.022 - 0.01 * noise(p * 30.0, seed)));
}

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  vec3 c = INK;
  float inEnd = 0.5 - HOLD / 2.0, outStart = 0.5 + HOLD / 2.0;
  vec3 col;
  if (pr < inEnd) col = mix(a, c, ink(p, pr / inEnd, 1.0));
  else if (pr < outStart) col = c;
  else col = mix(c, b, ink(p, (pr - outStart) / (1.0 - outStart), 2.0));
  if (pr >= 1.0) col = b;
  fragColor = vec4(col, 1.0);
}
