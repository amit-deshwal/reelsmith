#version 300 es
precision highp float;

// Break-in bars (RS-408/RS-409). The incoming picture slides in through N bars; each bar enters from the
// opposite side of its neighbour (alternate) or all from one side, with a stagger between bars. At
// u_progress = 1 every bar is at rest, so the incoming shot is exact and there are no seams.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_count;      // number of bars
uniform float u_stagger;    // 0..0.9, share of the duration spent on the delay between first and last bar
uniform float u_dir;        // +1 enter from the top/left edge, -1 from the bottom/right edge, 0 alternate
uniform float u_horizontal; // 0 = vertical bars (columns) sliding up/down, 1 = horizontal bars (rows) sliding sideways

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord;
  float along = u_horizontal > 0.5 ? uv.y : uv.x;   // position across the bars
  float slide = u_horizontal > 0.5 ? uv.x : uv.y;   // position along the sliding axis
  float n = max(u_count, 1.0);
  float i = min(floor(along * n), n - 1.0);
  float s = clamp(u_stagger, 0.0, 0.9);
  float delay = n > 1.0 ? s * i / (n - 1.0) : 0.0;
  float local = clamp((u_progress - delay) / (1.0 - s), 0.0, 1.0);
  float e = local * local * (3.0 - 2.0 * local);
  float dir = u_dir == 0.0 ? (mod(i, 2.0) < 0.5 ? 1.0 : -1.0) : u_dir;
  float s2 = slide + dir * (1.0 - e);   // sample position of the sliding incoming picture
  vec2 suv = u_horizontal > 0.5 ? vec2(s2, uv.y) : vec2(uv.x, s2);
  bool inside = s2 >= 0.0 && s2 <= 1.0;
  fragColor = inside ? texture(u_incoming, suv) : texture(u_outgoing, uv);
}
