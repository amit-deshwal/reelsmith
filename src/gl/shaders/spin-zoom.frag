#version 300 es
precision highp float;

// Spin zoom (Reels). The outgoing shot spins and scales away while the incoming one spins in from the opposite turn, both with
// angular blur. Edges are mirrored, never black. Spin and blur are 0 at both ends.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_angle;     // radians turned at the cut
uniform float u_zoom;      // extra scale at the cut
uniform float u_blur;      // angular blur, share of the turn
uniform float u_dir;       // +1 or -1: which way it spins

in vec2 v_texCoord;
out vec4 fragColor;

const int N = 12;

vec2 mirror(vec2 uv) { return 1.0 - abs(1.0 - mod(uv, 2.0)); }

vec3 spun(sampler2D tex, vec2 uv, float angle, float scale) {
  vec2 q = (uv - 0.5) * vec2(u_aspect, 1.0) / scale;
  float c = cos(angle), s = sin(angle);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return texture(tex, mirror(q / vec2(u_aspect, 1.0) + 0.5)).rgb;
}

void main() {
  float p = u_progress;
  float e = p * p * (3.0 - 2.0 * p);
  float arc = sin(3.14159265 * p);
  float spread = u_angle * u_blur * arc;
  float m = smoothstep(0.4, 0.6, p);
  float aOut = u_dir * u_angle * e, aIn = -u_dir * u_angle * (1.0 - e);
  float sOut = 1.0 + u_zoom * e, sIn = 1.0 + u_zoom * (1.0 - e);
  vec3 a = vec3(0.0), b = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) / float(N - 1) - 0.5) * spread;
    if (m < 1.0) a += spun(u_outgoing, v_texCoord, aOut + t, sOut);
    if (m > 0.0) b += spun(u_incoming, v_texCoord, aIn + t, sIn);
  }
  fragColor = vec4(mix(a, b, m) / float(N), 1.0);
}
