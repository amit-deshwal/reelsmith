#version 300 es
precision highp float;
// Watercolor: soft pigment washes with darker pooled edges, bleeding colour and visible paper grain.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_smooth;
uniform float u_paper;
uniform float u_edge;
uniform float u_bleed;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 tex(vec2 uv) { return texture(u_input, clamp(uv, 0.0, 1.0)).rgb; }
void main() {
  float sc = u_resolution.x / 1080.0;
  vec2 px = 1.0 / u_resolution;
  vec2 p = v_texCoord * u_resolution / sc;
  vec2 warp = (vec2(noise(p * 0.02), noise(p * 0.02 + 8.0)) - 0.5) * 0.006 * u_bleed;
  vec2 uv = v_texCoord + warp;
  // Kuwahara-style: the least varied of four quadrants
  float r = u_smooth * sc;
  vec3 best = vec3(0.0); float bestVar = 1e9;
  for (int q = 0; q < 4; q++) {
    vec2 o = vec2(q % 2 == 0 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0);
    vec3 m = vec3(0.0); float m2 = 0.0;
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
      vec3 s = tex(uv + (vec2(float(i), float(j)) * o) * px * r);
      m += s; m2 += dot(s, s);
    }
    m /= 9.0; m2 /= 9.0;
    float v = m2 - dot(m, m);
    if (v < bestVar) { bestVar = v; best = m; }
  }
  vec3 c = best;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.25);
  c = mix(c, vec3(1.0), 0.03 + 0.1 * noise(p * 0.012));            // uneven pigment
  float lA = dot(tex(uv + vec2(px.x * 2.0 * sc, 0.0)), vec3(0.299, 0.587, 0.114)) - dot(tex(uv - vec2(px.x * 2.0 * sc, 0.0)), vec3(0.299, 0.587, 0.114));
  float lB = dot(tex(uv + vec2(0.0, px.y * 2.0 * sc)), vec3(0.299, 0.587, 0.114)) - dot(tex(uv - vec2(0.0, px.y * 2.0 * sc)), vec3(0.299, 0.587, 0.114));
  float edge = smoothstep(0.04, 0.3, length(vec2(lA, lB)));
  c *= 1.0 - edge * u_edge * 0.45;                                   // pigment pools at edges
  float grain = noise(p * 0.7) * 0.6 + noise(p * 2.3) * 0.4;
  c *= 1.0 + (grain - 0.5) * 0.3 * u_paper;                         // paper tooth, centred so it never greys the picture
  c = clamp((c - 0.5) * 1.12 + 0.5, 0.0, 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
