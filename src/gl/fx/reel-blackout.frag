#version 300 es
precision highp float;
// Blackout: the picture drops to black (or a colour). With timing "beat" it strobes black on the beats and comes back.
uniform sampler2D u_input;
uniform float u_amount;
uniform vec3 u_color;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_input, v_texCoord);
  fragColor = vec4(mix(c.rgb, u_color * c.a, clamp(u_amount, 0.0, 1.0)), c.a);
}
