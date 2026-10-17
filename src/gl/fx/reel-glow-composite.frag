#version 300 es
precision highp float;
// Screens a blurred glow over the original (u_input) and can lift the blacks like a diffusion filter.
uniform sampler2D u_input;
uniform sampler2D u_glow;
uniform float u_intensity;
uniform float u_lift;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec3 base = texture(u_input, v_texCoord).rgb;
  vec3 glow = texture(u_glow, v_texCoord).rgb * u_intensity;
  vec3 c = 1.0 - (1.0 - base) * (1.0 - clamp(glow, 0.0, 1.0));
  c = u_lift + c * (1.0 - u_lift);
  fragColor = vec4(c, 1.0);
}
