#version 300 es
precision highp float;

// Zoom through (Reels). The camera punches into the outgoing shot, streaking and splitting colour, and comes out of the
// incoming one. Blur and colour split are 0 at both ends, so progress 0 / 1 are the untouched pictures.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_zoom;      // extra scale at the cut (1 = double)
uniform float u_blur;      // streak length at the cut, share of the distance to the centre
uniform float u_split;     // colour fringe, share of the streak
uniform vec2 u_center;

in vec2 v_texCoord;
out vec4 fragColor;

const int N = 14;

vec3 streak(sampler2D tex, vec2 uv, float scale, float blur) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = float(i) / float(N - 1);
    vec2 d = (uv - u_center) / scale;
    float k = 1.0 - blur * t;
    acc.r += texture(tex, clamp(u_center + d * (k * (1.0 + u_split * blur)), 0.0, 1.0)).r;
    acc.g += texture(tex, clamp(u_center + d * k, 0.0, 1.0)).g;
    acc.b += texture(tex, clamp(u_center + d * (k * (1.0 - u_split * blur)), 0.0, 1.0)).b;
  }
  return acc / float(N);
}

void main() {
  float p = u_progress;
  float e = p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0;
  float arc = sin(3.14159265 * p);
  float blur = u_blur * arc;
  float m = smoothstep(0.42, 0.58, p);
  vec3 col;
  if (m <= 0.0) col = streak(u_outgoing, v_texCoord, 1.0 + u_zoom * e, blur);
  else if (m >= 1.0) col = streak(u_incoming, v_texCoord, 1.0 + u_zoom * (1.0 - e), blur);
  else col = mix(streak(u_outgoing, v_texCoord, 1.0 + u_zoom * e, blur), streak(u_incoming, v_texCoord, 1.0 + u_zoom * (1.0 - e), blur), m);
  col *= 1.0 + 0.18 * arc * arc;  // a little light at the cut
  fragColor = vec4(col, 1.0);
}
