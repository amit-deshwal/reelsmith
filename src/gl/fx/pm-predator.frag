#version 300 es
precision highp float;
// Predator vision: the person glows hot (white core, orange and red edges) on a cold, dark blue scene, with scanlines and sensor
// noise. The heat is deepest in the middle of the body, from a blurred copy of the matte.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_heat;
uniform float u_cold;
uniform float u_scan;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.05), c1 = vec3(0.1, 0.0, 0.5), c2 = vec3(0.65, 0.0, 0.5), c3 = vec3(0.95, 0.15, 0.1), c4 = vec3(1.0, 0.6, 0.05), c5 = vec3(1.0, 0.95, 0.4), c6 = vec3(1.0);
  if (t < 0.17) return mix(c0, c1, t / 0.17);
  if (t < 0.34) return mix(c1, c2, (t - 0.17) / 0.17);
  if (t < 0.5) return mix(c2, c3, (t - 0.34) / 0.16);
  if (t < 0.67) return mix(c3, c4, (t - 0.5) / 0.17);
  if (t < 0.84) return mix(c4, c5, (t - 0.67) / 0.17);
  return mix(c5, c6, (t - 0.84) / 0.16);
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  float core = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a) / aspect, sin(a));
    core += maskAt(uv + d * 0.015) + maskAt(uv + d * 0.035);
  }
  core = core / 24.0;
  float body = clamp(0.1 + 0.62 * smoothstep(0.3, 1.0, core) * u_heat + (l - 0.5) * 0.4, 0.0, 1.0);
  vec3 hot = heat(0.28 + 0.64 * body);
  vec3 cold = heat(0.02 + 0.2 * l * u_cold) * vec3(0.7, 0.8, 1.2);
  float halo = smoothstep(0.0, 0.5, core) * (1.0 - m);
  vec3 col = mix(cold, hot, m);
  col += vec3(1.0, 0.35, 0.1) * halo * 0.35 * u_heat;
  float sc = u_resolution.x / 1080.0;
  float line = 0.5 + 0.5 * sin(uv.y * u_resolution.y / sc * 1.4);
  col *= 1.0 - u_scan * 0.22 * line;
  col += (hash(uv * u_resolution + floor(u_time * 24.0)) - 0.5) * 0.05;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
