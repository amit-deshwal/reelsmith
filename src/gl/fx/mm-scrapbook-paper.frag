#version 300 es
precision highp float;
// Scrapbook paper: the clip becomes a taped, slightly tilted photo with a white border and a soft shadow, pasted on patterned paper
// (stripes, dots, grid or crayon scribble). The tilt wobbles at 8 fps so it feels hand-placed.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pattern;   // 0 stripes, 1 dots, 2 grid, 3 crayon scribble
uniform float u_size;      // photo size, share of the frame
uniform float u_tilt;      // degrees
uniform float u_border;    // white border width
uniform vec3 u_paperA;
uniform vec3 u_paperB;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float box(vec2 p, vec2 lo, vec2 hi) {
  vec2 c = (lo + hi) * 0.5, h = (hi - lo) * 0.5;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float t = floor(u_time * 8.0);
  vec2 q = (v_texCoord - 0.5) * vec2(aspect, 1.0);
  // patterned paper
  float scale = 14.0;
  vec3 bg;
  if (u_pattern < 0.5) bg = mix(u_paperA, u_paperB, step(0.5, fract((q.x + q.y) * scale * 0.7)));
  else if (u_pattern < 1.5) { vec2 g = fract(q * scale * 0.6) - 0.5; bg = mix(u_paperA, u_paperB, smoothstep(0.27, 0.23, length(g))); }
  else if (u_pattern < 2.5) { vec2 g = abs(fract(q * scale * 0.55) - 0.5); bg = mix(u_paperA, u_paperB, smoothstep(0.46, 0.44, max(g.x, g.y)) * 0.0 + step(0.44, max(g.x, g.y))); }
  else { float s = noise(vec2(dot(q, vec2(-0.57, 0.82)) * 90.0, dot(q, vec2(0.82, 0.57)) * 5.0 + t)); bg = mix(u_paperA, u_paperB, smoothstep(0.45, 0.75, s)); }
  bg *= 0.94 + 0.06 * noise(v_texCoord * u_resolution * 0.3);
  // photo
  float ang = radians(u_tilt) * (1.0 + 0.3 * (hash(vec2(t, 1.0)) - 0.5));
  float s = sin(ang), c = cos(ang);
  vec2 r = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  vec2 half_ = 0.5 * u_size * vec2(aspect, 1.0);
  vec2 shiftUp = vec2(0.0, 0.03);
  vec2 lo = -half_ - u_border + shiftUp, hi = half_ + u_border + shiftUp;
  lo.y -= u_border * 1.8;                               // polaroid: a thicker bottom border
  float dFrame = box(r, lo, hi);
  float dShadow = box(r - vec2(0.012, -0.016), lo, hi);
  vec3 col = bg * (1.0 - 0.35 * smoothstep(0.03, 0.0, dShadow));
  if (dFrame < 0.0) {
    col = vec3(0.985, 0.975, 0.95);
    vec2 pr = r - shiftUp;
    if (abs(pr.x) < half_.x && pr.y > -half_.y && pr.y < half_.y) col = texture(u_input, clamp(pr / (2.0 * half_) + 0.5, 0.0, 1.0)).rgb;
  }
  // tape
  for (int i = 0; i < 2; i++) {
    float sgn = i == 0 ? -1.0 : 1.0;
    vec2 tc = r - vec2(sgn * (half_.x + u_border) * 0.85, hi.y - 0.004);
    float ta = sgn * 0.6;
    vec2 tr = vec2(cos(ta) * tc.x - sin(ta) * tc.y, sin(ta) * tc.x + cos(ta) * tc.y);
    float inside = step(abs(tr.x), 0.085) * step(abs(tr.y), 0.026);
    col = mix(col, vec3(1.0, 0.93, 0.5) * (0.95 + 0.05 * noise(tr * 300.0)), inside * 0.82);
  }
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
