#version 300 es
precision highp float;
// Orbital screens: small glass screens, each showing its own crop of the video, orbit the person on a tilted ring, passing
// behind them (hidden by the person) and in front of them.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform vec2 u_subjectSize;
uniform float u_count;
uniform float u_speed;
uniform float u_size;
uniform float u_ring;
uniform float u_tilt;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
float sdRound(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
// one screen: returns rgb + coverage
vec4 screenAt(int i, vec2 uv, float aspect, out float depth) {
  float n = max(u_count, 1.0);
  float a = u_time * u_speed + float(i) * 6.2831853 / n;
  float rx = clamp(u_subjectSize.x * 0.62, 0.2, 0.36) * u_ring;
  vec2 centre = u_subjectCenter + vec2(cos(a) * rx, -sin(a) * rx * 0.3 * u_tilt + 0.03);
  depth = sin(a);                                  // > 0: in front of the person
  float s = u_size * (0.8 + 0.22 * depth);
  vec2 p = (uv - centre) * vec2(aspect, 1.0);
  vec2 half_ = vec2(s * 0.5625, s) * 0.5;
  float d = sdRound(p, half_, s * 0.12);
  float inside = smoothstep(0.002, -0.002, d);
  float rimA = smoothstep(0.012, 0.004, abs(d + 0.006));
  vec2 local = p / (half_ * 2.0);
  vec2 cc = vec2(0.2 + 0.6 * hash(float(i) + 3.0), 0.25 + 0.5 * hash(float(i) + 11.0));
  vec3 col = texture(u_input, clamp(cc + local * vec2(0.2, 0.28), 0.0, 1.0)).rgb;
  col = mix(col, vec3(1.0), rimA * 0.9);
  col += 0.08 * smoothstep(0.1, -0.5, local.x + local.y);        // glass sheen
  float shadow = smoothstep(0.03, 0.0, d) * 0.25;
  return vec4(col, max(inside, rimA * 0.9 + shadow * 0.0));
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 col = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  for (int i = 0; i < 8; i++) {                     // behind the person first
    if (float(i) >= u_count) break;
    float depth;
    vec4 s = screenAt(i, uv, aspect, depth);
    if (depth < 0.0) col = mix(col, s.rgb, s.a * (1.0 - m));
  }
  for (int i = 0; i < 8; i++) {                     // then in front
    if (float(i) >= u_count) break;
    float depth;
    vec4 s = screenAt(i, uv, aspect, depth);
    if (depth >= 0.0) col = mix(col, s.rgb, s.a);
  }
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
