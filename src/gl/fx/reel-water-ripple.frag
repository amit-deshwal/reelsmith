#version 300 es
precision highp float;
// Water ripple: the picture wobbles as if seen through moving water; two travelling sine waves, no loss of the frame edges.
uniform sampler2D u_input;
uniform float u_time;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_speed;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  float t = u_time * u_speed;
  vec2 p = v_texCoord;
  vec2 off = vec2(
    sin(p.y * u_frequency + t) + 0.5 * sin(p.y * u_frequency * 2.3 - t * 1.3),
    cos(p.x * u_frequency * 0.8 + t * 0.9) + 0.5 * cos(p.x * u_frequency * 1.9 - t)
  ) * u_amplitude * 0.01;
  fragColor = vec4(texture(u_input, clamp(p + off, 0.0, 1.0)).rgb, 1.0);
}
