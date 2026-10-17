#version 300 es
precision highp float;
// God rays: smears the bright parts radially away from a light position, with decay.
uniform sampler2D u_input;
uniform float u_lightX;
uniform float u_lightY;
uniform float u_length;
in vec2 v_texCoord;
out vec4 fragColor;
const int N = 40;
void main() {
  vec2 light = vec2(u_lightX, u_lightY);
  vec2 delta = (light - v_texCoord) * u_length / float(N);
  vec2 uv = v_texCoord;
  vec3 acc = vec3(0.0);
  float decay = 1.0;
  for (int i = 0; i < N; i++) {
    uv += delta;
    acc += texture(u_input, clamp(uv, 0.0, 1.0)).rgb * decay;
    decay *= 0.965;
  }
  fragColor = vec4(acc / float(N) * 2.2, 1.0);
}
