#version 300 es
precision highp float;
// Zoom blur: radial streaks toward a centre point; the centre stays sharp.
uniform sampler2D u_input;
uniform float u_amount;
uniform float u_centerX;
uniform float u_centerY;
in vec2 v_texCoord;
out vec4 fragColor;
const int N = 24;
void main() {
  vec2 c = vec2(u_centerX, u_centerY);
  vec2 d = v_texCoord - c;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1);
    acc += texture(u_input, clamp(c + d * (1.0 - u_amount * t), 0.0, 1.0)).rgb;
  }
  fragColor = vec4(acc / float(N), 1.0);
}
