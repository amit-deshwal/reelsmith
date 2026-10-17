#version 300 es
precision highp float;
// Soft vignette: darkens toward the corners by at most u_strength and never goes to black, so it can be left on at any setting.
uniform sampler2D u_input;
uniform float u_strength;
uniform float u_size;
uniform float u_softness;
uniform float u_roundness;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_input, v_texCoord);
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 q = (v_texCoord - 0.5) * 2.0;
  vec2 round_ = q * vec2(aspect, 1.0) / max(aspect, 1.0);   // 1 = a circle, 0 = follows the frame
  q = mix(q, round_ * 1.2, u_roundness);
  float d = length(q) / 1.41421356;
  float v = smoothstep(u_size, u_size + max(u_softness, 0.01), d);
  fragColor = vec4(c.rgb * (1.0 - u_strength * v), c.a);
}
