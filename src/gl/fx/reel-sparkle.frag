#version 300 es
precision highp float;
// Sparkle: four-point star glints grow out of small bright points (sun on water, jewellery, city lights) and twinkle.
// Only points brighter than their surroundings sparkle, so a bright sky or a white shirt stays as it is.
uniform sampler2D u_input;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_threshold;     // how bright a point must be to sparkle
uniform float u_length;        // star arm length, share of the frame height
uniform float u_intensity;
uniform float u_twinkle;
in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lum(vec2 p) { vec3 c = texture(u_input, clamp(p, 0.0, 1.0)).rgb; return max(c.r, max(c.g, c.b)); }
// how much a point stands out: bright, and a small peak
float peak(vec2 p, vec2 ring) {
  float l = lum(p);
  // brighter than every neighbour (an edge is only brighter on one side)
  float around = max(max(lum(p + vec2(ring.x, 0.0)), lum(p - vec2(ring.x, 0.0))), max(lum(p + vec2(0.0, ring.y)), lum(p - vec2(0.0, ring.y))));
  return smoothstep(u_threshold, 1.0, l) * smoothstep(0.03, 0.15, l - around);
}

void main() {
  vec2 uv = v_texCoord;
  vec4 base = texture(u_input, uv);
  float aspect = u_resolution.x / u_resolution.y;
  vec2 ring = vec2(0.012 / aspect, 0.012);
  float acc = peak(uv, ring) * 2.0;
  for (int i = 1; i <= 8; i++) {
    float k = float(i) / 8.0;
    float d = k * u_length;
    float wgt = (1.0 - k) * (1.0 - k);
    vec2 sx = vec2(d / aspect, 0.0), sy = vec2(0.0, d);
    acc += (peak(uv + sx, ring) + peak(uv - sx, ring) + peak(uv + sy, ring) + peak(uv - sy, ring)) * wgt;
  }
  float tw = 1.0 - u_twinkle + u_twinkle * noise(uv * vec2(aspect, 1.0) * 9.0 + vec2(u_time * 2.3, -u_time * 1.7));
  vec3 glint = vec3(1.0, 0.96, 0.88) * acc / 4.0 * u_intensity * tw;
  fragColor = vec4(min(base.rgb + glint * base.a, vec3(1.0)), base.a);
}
