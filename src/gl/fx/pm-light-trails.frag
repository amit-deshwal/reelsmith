#version 300 es
precision highp float;
// Light trails: streaks of the person's own light stretch off them, either in one direction (like a long exposure panning) or
// outward in a burst. Each streak is a thin line that marches back towards the person and borrows their colour; only the bright
// parts of the person emit light when the threshold is raised.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform float u_length;     // streak length as a share of the frame
uniform float u_angle;      // direction the light flows, degrees (0 right, 90 up)
uniform float u_mode;       // 0 one direction, 1 burst outwards from the person
uniform float u_lines;      // streak density across the frame
uniform float u_glow;
uniform float u_threshold;  // only light above this brightness is thrown off the person
uniform float u_tint;
uniform float u_dim;
uniform vec3 u_trailColor;
in vec2 v_texCoord;
out vec4 fragColor;
float h11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 asp = vec2(aspect, 1.0);
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, texture(u_mask, uv).r);
  vec2 P = (uv - u_subjectCenter) * asp;
  bool burst = u_mode > 0.5;
  float a = radians(u_angle);
  vec2 dir = burst ? normalize(P + vec2(1e-4)) : vec2(cos(a), sin(a));
  vec2 perp = vec2(-dir.y, dir.x);
  float coord = burst ? atan(P.y, P.x) * u_lines * 0.32 : dot(P, perp) * u_lines;
  float id = floor(coord);
  float flick = floor(u_time * 6.0);
  float h = h11(id + flick * 0.13);
  float on = step(0.3, h11(id * 3.7 + 1.3));                   // some lines stay dark
  float len = u_length * (0.3 + 0.7 * h11(id * 1.9 + flick * 0.07));
  float across = abs(fract(coord) - 0.5);
  float line = smoothstep(0.5, 0.18, across);                  // thin bright core, soft sides
  vec3 acc = vec3(0.0);
  const int N = 28;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    vec2 suv = uv - dir * (len * t) / asp;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float ms = smoothstep(0.42, 0.58, texture(u_mask, suv).r);
    vec3 c = texture(u_input, suv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float emit = ms * smoothstep(u_threshold - 0.25, u_threshold, l);
    acc += c * emit * pow(1.0 - t, 1.2);
  }
  vec3 trail = acc * (6.0 / float(N)) * u_glow * on * line;
  float tl = dot(trail, vec3(0.299, 0.587, 0.114));
  trail = mix(trail, tl * u_trailColor * 1.8, u_tint);
  vec3 col = src * (1.0 - u_dim * (1.0 - m));
  col = 1.0 - (1.0 - col) * (1.0 - clamp(trail, 0.0, 1.0));   // screen
  col = mix(col, src, m);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
