#version 300 es
precision highp float;
// Frame division: the frame is cut into irregular slabs and slivers, each showing its own crop and zoom of the picture, re-cut
// every u_interval seconds. Thin black gaps separate the slabs.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_depth;
uniform float u_gap;
uniform float u_interval;
uniform float u_zoom;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
void main() {
  float cut = floor(u_time / max(u_interval, 0.05));
  vec2 lo = vec2(0.0), hi = vec2(1.0);
  float id = cut * 7.31;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= u_depth) break;
    float h = hash(id + float(i) * 13.7);
    if (h < 0.15) continue;                            // some regions stay whole: irregular slabs
    vec2 size = hi - lo;
    bool vertical = size.x * u_resolution.x > size.y * u_resolution.y ? hash(id + float(i) * 3.3) < 0.8 : hash(id + float(i) * 3.3) < 0.2;
    float r = 0.28 + 0.44 * hash(id * 1.7 + float(i) * 5.9);
    if (vertical) {
      float m = lo.x + size.x * r;
      if (v_texCoord.x < m) { hi.x = m; id = id * 2.0 + 0.0; } else { lo.x = m; id = id * 2.0 + 1.0; }
    } else {
      float m = lo.y + size.y * r;
      if (v_texCoord.y < m) { hi.y = m; id = id * 2.0 + 0.0; } else { lo.y = m; id = id * 2.0 + 1.0; }
    }
  }
  vec2 centre = (lo + hi) * 0.5;
  float z = 1.0 + u_zoom * hash(id * 3.17);
  // each slab looks at its own crop of the picture, chosen so the crop stays inside the frame
  vec2 half_ = (hi - lo) * 0.5 / z;
  vec2 crop = mix(half_, 1.0 - half_, vec2(hash(id * 5.1), hash(id * 7.7)));
  vec2 uv = crop + (v_texCoord - centre) / z;
  vec3 col = texture(u_input, clamp(uv, 0.0, 1.0)).rgb;
  vec2 d = min(v_texCoord - lo, hi - v_texCoord) * u_resolution / (u_resolution.x / 1080.0);
  float edge = min(d.x, d.y);
  col *= smoothstep(u_gap * 0.5, u_gap, edge);
  fragColor = vec4(col, 1.0);
}
