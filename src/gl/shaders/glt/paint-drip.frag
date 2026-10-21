#version 300 es
precision highp float;
precision highp int;

// Paint drip (Reels). Orange paint pours down from the top with dripping runs until the screen is
// covered, then slides off the bottom with its drips trailing up, onto the next shot. A section break; colourful stories.
// Adapted from GTKottman/remotion-transitions "paint-drip" (MIT), with a darker wet edge.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 PAINT = vec3(0.95, 0.38, 0.14);   // the warm brand orange of dip-to-colour
const float HOLD = 0.1;
const int DRIPS = 9;

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


float capsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Signed distance to the paint at phase time t; y runs 0..1 down the frame (flip: up), x 0..aspect.
float paint(vec2 p, float t) {
  float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  float base = mix(-0.25, 1.15, e);
  float sdf = p.y - base - 0.012 * noise(vec2(p.x * 5.0 / u_aspect, 0.0), 1.0);
  for (int i = 0; i < DRIPS; i++) {
    float fi = float(i);
    float x = (fi + 0.5 + (hash1(vec2(fi, 1.0), 1.0) - 0.5) * 0.7) / float(DRIPS) * u_aspect;
    float w = 0.01 + 0.018 * hash1(vec2(fi, 2.0), 1.0);
    float len = (0.05 + 0.3 * hash1(vec2(fi, 3.0), 1.0)) * smoothstep(0.0, 0.35, t);
    sdf = smin(sdf, capsule(p, vec2(x, base - 0.05), vec2(x, base + len), w), 0.05);
  }
  if (t <= 0.0) sdf = 1.0;
  if (t >= 1.0) sdf = -1.0;
  return sdf;
}

vec3 wet(vec3 c, float sdf) { return c * (1.0 - 0.22 * exp(sdf * 70.0)); }   // darker along the inside of the edge

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  vec3 c = PAINT;
  float inEnd = 0.5 - HOLD / 2.0, outStart = 0.5 + HOLD / 2.0;
  vec3 col;
  if (pr < inEnd) {
    float d = paint(p, pr / inEnd);
    col = mix(a, wet(c, d), cover(d));
  } else if (pr < outStart) col = c;
  else {
    float d = paint(vec2(p.x, 1.0 - p.y), 1.0 - (pr - outStart) / (1.0 - outStart));
    col = mix(b, wet(c, d), cover(d));
  }
  if (pr >= 1.0) col = b;
  fragColor = vec4(col, 1.0);
}
