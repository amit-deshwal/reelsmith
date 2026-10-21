#version 300 es
precision highp float;
precision highp int;

// Liquid warp (Reels). A fractal-noise displacement swells to a peak at the middle and ebbs away, the picture swelling
// slightly with it and splitting into colour fringes; the next shot fades in under the strongest ripple. Dreamy, trippy,
// water, a memory. Adapted from GTKottman/remotion-transitions "liquid-warp" (MIT), with the colour fringe added.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float STRENGTH = 0.05;   // displacement at the peak, in frame heights
const float FREQ = 6.5;        // noise cycles per frame height

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

float seg(float p, float a, float b) { return clamp((p - a) / (b - a), 0.0, 1.0); }
float inOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

vec3 warped(sampler2D tex, vec2 uv, vec2 disp, float zoom) {
  vec2 c = (uv - 0.5) / zoom + 0.5;
  return vec3(texture(tex, c + disp * 1.0).r, texture(tex, c + disp * 1.07).g, texture(tex, c + disp * 1.14).b);
}

void main() {
  float pr = u_progress;
  vec2 uv = v_texCoord;
  float k = pow(max(sin(3.14159265 * pr), 0.0), 1.4);
  float bf = FREQ * (1.0 + 0.25 * pr);
  vec2 p = vec2(uv.x * u_aspect, uv.y);
  vec2 n = vec2(fbm(p * vec2(bf, bf * 1.6), 1.0), fbm(p * vec2(bf, bf * 1.6) + 19.7, 1.0));
  vec2 disp = n * STRENGTH * k / vec2(u_aspect, 1.0);
  float zoom = 1.0 + 0.08 * k;
  vec3 a = warped(u_outgoing, uv, disp, zoom);
  vec3 b = warped(u_incoming, uv, disp, zoom);
  fragColor = vec4(mix(a, b, inOutCubic(seg(pr, 0.3, 0.7))), 1.0);
}
