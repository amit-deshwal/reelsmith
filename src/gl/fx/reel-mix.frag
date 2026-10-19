#version 300 es
precision highp float;
// Reelsmith effect envelope: blends an effect's output (u_input) over the picture it started from (u_before) by
// u_amount, everywhere (region 0), only on the person (1) or only behind them (2). Without a matte yet it blends everywhere.
uniform sampler2D u_input;
uniform sampler2D u_before;
uniform sampler2D u_mask;
uniform float u_amount;
uniform float u_region;
uniform float u_hasMask;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec4 fx = texture(u_input, v_texCoord);
  vec4 src = texture(u_before, v_texCoord);
  float m = u_hasMask > 0.5 ? smoothstep(0.35, 0.65, texture(u_mask, v_texCoord).r) : 1.0;
  float w = u_region > 1.5 ? (u_hasMask > 0.5 ? 1.0 - m : 1.0) : (u_region > 0.5 ? m : 1.0);
  fragColor = mix(src, fx, clamp(u_amount, 0.0, 1.0) * w);
}
