#version 300 es
precision highp float;
// Follow tag: a label (white text on a dark pill) that rides above the person's head and follows them as they move, like
// body-tracked text. The person's box comes from the person matte every frame; with nobody in the shot the label hides.
uniform sampler2D u_input;
uniform sampler2D u_mask;      // person matte: where an arm or the head reaches into the label, the person stays in front
uniform sampler2D u_text;      // textLayer "tag" cell: red = the pill, green = the letters
uniform float u_textAspect;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_subjectCenter;  // 0..1, y up
uniform vec2 u_subjectSize;
uniform float u_subjectArea;
uniform float u_size;          // label height, share of the frame height
uniform float u_gap;           // space between head and label, share of the frame height
uniform float u_pop;           // seconds the label takes to pop in
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord;
  vec4 base = texture(u_input, uv);
  float has = smoothstep(0.01, 0.04, u_subjectArea);
  float h = u_size;
  float w = h * u_textAspect * (u_resolution.y / u_resolution.x);
  // the top of the head: scan the matte down from the top of the frame around the person's middle (y runs up)
  float top = u_subjectCenter.y + u_subjectSize.y * 0.5;
  for (int i = 0; i < 64; i++) {
    float y = 1.0 - float(i) / 64.0;
    float m = max(texture(u_mask, vec2(u_subjectCenter.x, y)).r,
              max(texture(u_mask, vec2(u_subjectCenter.x - u_subjectSize.x * 0.15, y)).r, texture(u_mask, vec2(u_subjectCenter.x + u_subjectSize.x * 0.15, y)).r));
    if (m > 0.5) { top = y; break; }
  }
  float cy = min(top + u_gap + h * 0.5, 0.9 - h * 0.5);
  float cx = clamp(u_subjectCenter.x, 0.5 * w + 0.04, 1.0 - 0.5 * w - 0.04);
  float p = clamp(u_time / max(u_pop, 0.01), 0.0, 1.0);
  float c1 = 1.70158, c3 = c1 + 1.0;
  float q = p - 1.0;  // back-out ease (no pow: negative bases are undefined in GLSL)
  float s = max(0.01, 1.0 + c3 * q * q * q + c1 * q * q);
  vec2 t = (uv - vec2(cx, cy)) / (vec2(w, h) * s) + 0.5;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0 || has < 0.001) { fragColor = base; return; }
  vec4 cell = texture(u_text, t);
  float a = has * smoothstep(0.0, 0.3, p) * (1.0 - smoothstep(0.5, 0.8, texture(u_mask, uv).r));
  vec3 col = mix(base.rgb, vec3(0.04), cell.r * 0.62 * a);
  col = mix(col, vec3(1.0), cell.g * a);
  fragColor = vec4(col, base.a);
}
