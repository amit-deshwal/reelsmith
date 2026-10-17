#version 300 es
precision highp float;
// Thermal vision: brightness becomes heat on a camera palette (black, blue, purple, red, orange, yellow, white), with scanlines,
// sensor noise and optional targeting brackets.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_contrast;
uniform float u_scan;
uniform float u_hud;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.04), c1 = vec3(0.1, 0.0, 0.55), c2 = vec3(0.65, 0.0, 0.5), c3 = vec3(0.95, 0.15, 0.1), c4 = vec3(1.0, 0.6, 0.05), c5 = vec3(1.0, 0.95, 0.4), c6 = vec3(1.0);
  if (t < 0.17) return mix(c0, c1, t / 0.17);
  if (t < 0.34) return mix(c1, c2, (t - 0.17) / 0.17);
  if (t < 0.5) return mix(c2, c3, (t - 0.34) / 0.16);
  if (t < 0.67) return mix(c3, c4, (t - 0.5) / 0.17);
  if (t < 0.84) return mix(c4, c5, (t - 0.67) / 0.17);
  return mix(c5, c6, (t - 0.84) / 0.16);
}
void main() {
  float sc = u_resolution.x / 1080.0;
  vec2 px = 1.0 / u_resolution;
  float l = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) l += dot(texture(u_input, clamp(v_texCoord + vec2(float(x), float(y)) * px * 2.0 * sc, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
  l /= 9.0;
  l = clamp((l - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float t = floor(u_time * 24.0);
  l += (hash(v_texCoord * u_resolution + t) - 0.5) * 0.04;
  vec3 col = heat(l);
  float line = 0.5 + 0.5 * sin(v_texCoord.y * u_resolution.y / sc * 1.4);
  col *= 1.0 - u_scan * 0.25 * line;
  float roll = fract(u_time * 0.2);
  col += u_scan * 0.08 * smoothstep(0.03, 0.0, abs(v_texCoord.y - roll));
  // targeting brackets
  vec2 q = abs(v_texCoord - 0.5);
  float inner = 0.34, arm = 0.07, w = 0.0025;
  float br = step(max(q.x, q.y), inner + w) * step(inner - w, max(q.x, q.y));
  float corner = step(inner - arm, min(q.x, q.y)) ;
  float bracket = br * corner;
  float cross_ = (step(q.x, w) * step(q.y, 0.02) + step(q.y, w * 0.6) * step(q.x, 0.02));
  col = mix(col, vec3(1.0), clamp(bracket + cross_, 0.0, 1.0) * u_hud * 0.9);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
