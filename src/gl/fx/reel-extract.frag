#version 300 es
precision highp float;
// Keeps only the bright parts of the picture (soft threshold), optionally tinted: the source of halation, flares and rays.
uniform sampler2D u_input;
uniform float u_threshold;
uniform float u_knee;
uniform vec3 u_tint;
uniform float u_tintAmount;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec3 c = texture(u_input, v_texCoord).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float m = smoothstep(u_threshold, u_threshold + max(u_knee, 0.01), lum);
  vec3 tint = mix(vec3(1.0), u_tint, u_tintAmount);
  fragColor = vec4(c * m * tint, 1.0);
}
