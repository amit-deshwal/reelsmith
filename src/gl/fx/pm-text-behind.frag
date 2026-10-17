#version 300 es
precision highp float;
// Text behind the person: a big word in rows drifts across the scene and the person stays in front of it. u_text holds one cell
// (the word and a gap, white on black, tiles sideways); each row scrolls the other way from the one above.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform sampler2D u_text;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_textAspect;   // width / height of one cell
uniform float u_rows;
uniform float u_speed;
uniform float u_opacity;
uniform float u_outline;      // 0 filled letters, 1 hollow outline
uniform float u_dim;          // darken the scene so the word reads
uniform float u_shadow;
uniform vec3 u_textColor;
in vec2 v_texCoord;
out vec4 fragColor;
float cover(vec2 uv) { return texture(u_text, vec2(fract(uv.x), clamp(uv.y, 0.002, 0.998))).r; }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, texture(u_mask, uv).r);
  float rows = floor(u_rows + 0.5);
  float ry = uv.y * rows;
  float row = floor(ry);
  float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
  float cellW = u_textAspect / aspect / rows;                // a cell's width as a share of the frame
  float x = uv.x / cellW + u_time * u_speed * 0.12 * dir + row * 0.37;
  vec2 tuv = vec2(x, fract(ry));
  float t = cover(tuv);
  float px = 0.5 / (u_resolution.y / rows);                  // roughly one output pixel in cell coordinates
  float blur = (cover(tuv + vec2(px * 3.0, 0.0)) + cover(tuv - vec2(px * 3.0, 0.0)) + cover(tuv + vec2(0.0, px * 3.0)) + cover(tuv - vec2(0.0, px * 3.0))) * 0.25;
  float edge = clamp(abs(t - blur) * 4.0, 0.0, 1.0);
  float ink = mix(t, edge * step(0.05, max(t, blur)), u_outline);
  vec3 base = src * (1.0 - u_dim);
  vec2 sh = vec2(0.0, -2.5 / u_resolution.y * (1.0 + rows * 0.3));
  float sTex = cover(vec2(x, fract((uv.y + sh.y) * rows)));
  base *= 1.0 - u_shadow * 0.55 * sTex * (1.0 - ink);
  vec3 col = mix(base, u_textColor, ink * u_opacity);
  col = mix(col, src, m);                                    // the person in front of the words
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
