#version 300 es
precision highp float;
// One direction of a separable gaussian, 13 taps. u_direction is the step between taps in pixels, so a wide blur is a
// bigger step (a few of these in a row smooth it out).
uniform sampler2D u_input;
uniform vec2 u_direction;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec2 texel = u_direction / max(u_resolution, vec2(1.0));
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float f = float(i);
    float w = exp(-0.5 * f * f / 9.0);
    sum += texture(u_input, clamp(v_texCoord + f * texel, 0.0, 1.0)).rgb * w;
    wsum += w;
  }
  fragColor = vec4(sum / wsum, 1.0);
}
