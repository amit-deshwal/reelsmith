#version 300 es
precision highp float;
// Cut paper: the frame rebuilt from irregular pieces of coloured paper, each a flat colour taken from the picture, with a white cut
// edge and a small drop shadow, re-cut slightly at 8 fps so it feels like stop-motion collage.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_cells;
uniform float u_detail;
uniform float u_edge;
uniform float u_shadow;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.3)); }
vec2 site(vec2 cell, float t) { return cell + 0.5 + (hash2(cell) - 0.5) * 0.85 + (hash2(cell + t) - 0.5) * 0.06; }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float t = floor(u_time * 8.0);
  vec2 g = v_texCoord * vec2(u_cells * aspect, u_cells);
  vec2 ci = floor(g);
  float d1 = 9.0, d2 = 9.0;
  vec2 best = vec2(0.0);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 c = ci + vec2(float(i), float(j));
    vec2 s = site(c, t);
    float d = length(g - s);
    if (d < d1) { d2 = d1; d1 = d; best = s; } else if (d < d2) d2 = d;
  }
  vec2 siteUv = best / vec2(u_cells * aspect, u_cells);
  vec3 c = vec3(0.0);
  for (int k = 0; k < 5; k++) {
    vec2 o = k == 0 ? vec2(0.0) : (vec2(k == 1 ? 1.0 : k == 2 ? -1.0 : 0.0, k == 3 ? 1.0 : k == 4 ? -1.0 : 0.0)) * 0.012;
    c += texture(u_input, clamp(siteUv + o, 0.0, 1.0)).rgb;
  }
  c /= 5.0;
  vec3 local = texture(u_input, v_texCoord).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(l), c, 1.25), 0.0, 1.0);
  c = mix(c, local, u_detail);
  float fibre = 0.95 + 0.05 * hash(floor(v_texCoord * u_resolution * 0.5));
  float edge = d2 - d1;                                      // 0 on a cut edge between two pieces
  vec3 col = c * fibre;
  col = mix(vec3(0.98, 0.97, 0.94), col, smoothstep(0.0, u_edge, edge));
  col *= 1.0 - u_shadow * smoothstep(0.28, 0.0, edge) * smoothstep(0.0, 0.05, edge) * 0.5;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
