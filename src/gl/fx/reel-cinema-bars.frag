#version 300 es
precision highp float;
// Cinema bars: letterbox bars top and bottom with a soft edge. u_size is each bar's share of the frame height.
uniform sampler2D u_input;
uniform float u_size;
uniform float u_softness;
uniform vec3 u_color;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec3 c = texture(u_input, v_texCoord).rgb;
  float d = min(v_texCoord.y, 1.0 - v_texCoord.y);
  float m = smoothstep(u_size - u_softness, u_size + 0.0001, d);
  fragColor = vec4(mix(u_color, c, m), 1.0);
}
