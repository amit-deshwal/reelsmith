#version 300 es
precision highp float;

// Whip blur (Reels). Both shots sit on one strip that is whipped past the camera: eased, with directional motion blur and
// a colour split along the motion. The strip tiles exactly, so there is no gap or overlap and the ends are untouched.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform vec2 u_dir;        // direction the strip moves, e.g. (1,0): the next shot comes from the right
uniform float u_blur;      // blur length at full speed, in picture widths
uniform float u_split;     // colour split along the motion

in vec2 v_texCoord;
out vec4 fragColor;

const int N = 14;

vec3 strip(vec2 uv, float e) {
  vec2 uo = uv + u_dir * e;
  vec2 ui = uv - u_dir * (1.0 - e);
  bool inOut = uo.x >= 0.0 && uo.x <= 1.0 && uo.y >= 0.0 && uo.y <= 1.0;
  return inOut ? texture(u_outgoing, uo).rgb : texture(u_incoming, clamp(ui, 0.0, 1.0)).rgb;
}

void main() {
  float p = u_progress;
  float e = p < 0.5 ? 16.0 * p * p * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 5.0) / 2.0;   // fast in the middle
  float speed = sin(3.14159265 * p);
  float span = u_blur * speed;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) / float(N - 1) - 0.5) * span;
    acc.r += strip(v_texCoord, clamp(e + t + u_split * speed * 0.02, 0.0, 1.0)).r;
    acc.g += strip(v_texCoord, clamp(e + t, 0.0, 1.0)).g;
    acc.b += strip(v_texCoord, clamp(e + t - u_split * speed * 0.02, 0.0, 1.0)).b;
  }
  fragColor = vec4(acc / float(N), 1.0);
}
