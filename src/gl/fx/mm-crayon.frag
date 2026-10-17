#version 300 es
precision highp float;
// Crayon: the picture redrawn in wax crayon on cream paper. Colours are flattened into bands, laid in with diagonal strokes that
// leave paper showing through, outlined in a darker crayon, and the whole drawing boils at 8 fps like hand-made animation.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_wax;      // how waxy and solid the colour is (more = less paper showing)
uniform float u_bands;    // colour bands
uniform float u_outline;  // outline strength
uniform float u_boil;     // boil (wobble) amount
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 tex(vec2 uv) { return texture(u_input, clamp(uv, 0.0, 1.0)).rgb; }
float luma(vec2 uv) { return dot(tex(uv), vec3(0.299, 0.587, 0.114)); }
void main() {
  float sc = u_resolution.x / 1080.0;
  vec2 px = 1.0 / u_resolution;
  float t = floor(u_time * 8.0);
  vec2 wob = (vec2(noise(v_texCoord * 55.0 + t * 3.7), noise(v_texCoord * 55.0 + 17.0 + t * 5.1)) - 0.5) * 0.006 * u_boil;
  vec2 uv = v_texCoord + wob;
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) c += tex(uv + vec2(float(x), float(y)) * px * 3.0 * sc);
  c /= 9.0;
  float m = max(max(c.r, c.g), c.b);
  float q = floor(m * u_bands + 0.5) / u_bands;
  c *= q / max(m, 0.001);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(l), c, 1.4), 0.0, 1.0);
  vec2 p = v_texCoord * u_resolution / sc;
  vec2 d = vec2(0.8253, 0.5646), n = vec2(-0.5646, 0.8253);
  float streak = noise(vec2(dot(p, n) * 0.5, dot(p, d) * 0.04 + t * 0.7));
  float tooth = noise(p * 0.85 + t * 2.0);
  float cover = smoothstep(0.12, 0.5, streak * 0.55 + tooth * 0.45 + u_wax * 0.6 - 0.18);
  vec3 paper = vec3(0.96, 0.93, 0.85) * (0.93 + 0.07 * noise(p * 0.3));
  vec2 e = px * 1.6 * sc;
  float gx = luma(uv + vec2(e.x, 0.0)) - luma(uv - vec2(e.x, 0.0));
  float gy = luma(uv + vec2(0.0, e.y)) - luma(uv - vec2(0.0, e.y));
  float edge = smoothstep(0.06, 0.3, length(vec2(gx, gy))) * u_outline;
  vec3 col = mix(paper, c, cover);
  col = mix(col, c * 0.3, edge * (0.5 + 0.5 * tooth));
  col += (tooth - 0.5) * 0.07;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
