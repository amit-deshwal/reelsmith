#version 300 es
precision highp float;
// Pencil sketch: graphite outlines and cross-hatching on cream paper. Shadows get denser hatching; the lines shiver at 8 fps.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_hatch;
uniform float u_outline;
uniform float u_paper;
uniform float u_boil;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float luma(vec2 uv) { return dot(texture(u_input, clamp(uv, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  float sc = u_resolution.x / 1080.0;
  vec2 px = 1.0 / u_resolution;
  float t = floor(u_time * 8.0);
  vec2 uv = v_texCoord + (vec2(noise(v_texCoord * 70.0 + t * 2.3), noise(v_texCoord * 70.0 + 11.0 + t * 3.1)) - 0.5) * 0.004 * u_boil;
  float l = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) l += luma(uv + vec2(float(x), float(y)) * px * 2.0 * sc);
  l /= 9.0;
  vec2 e = px * 1.5 * sc;
  float gx = luma(uv + vec2(e.x, 0.0)) - luma(uv - vec2(e.x, 0.0));
  float gy = luma(uv + vec2(0.0, e.y)) - luma(uv - vec2(0.0, e.y));
  float edge = smoothstep(0.05, 0.28, length(vec2(gx, gy))) * u_outline;
  vec2 p = v_texCoord * u_resolution / sc;
  float h1 = smoothstep(0.42, 0.5, abs(fract((p.x + p.y) / 7.0 + noise(p * 0.05) * 0.4) - 0.5));
  float h2 = smoothstep(0.42, 0.5, abs(fract((p.x - p.y) / 7.0 + noise(p * 0.05 + 4.0) * 0.4) - 0.5));
  float dark1 = smoothstep(0.85, 0.45, l), dark2 = smoothstep(0.55, 0.22, l);
  float hatch = clamp(h1 * dark1 + h2 * dark2, 0.0, 1.0) * u_hatch;
  float graphite = clamp(edge + hatch * 0.75, 0.0, 1.0) * (0.75 + 0.25 * noise(p * 0.8 + t));
  vec3 paper = mix(vec3(1.0), vec3(0.96, 0.93, 0.85), u_paper) * (0.94 + 0.06 * noise(p * 0.3));
  vec3 col = mix(paper, vec3(0.13, 0.13, 0.15), graphite);
  col *= 1.0 - (1.0 - l) * 0.28;
  fragColor = vec4(col, 1.0);
}
