#version 300 es
precision highp float;
// MixMedia cut-out: the person cut out of the clip like a paper sticker (white edge, soft shadow) and set on patterned crayon paper
// with crayon doodles scribbled behind them, a few drawn over the sticker's edge. Everything hand-made redraws at 8 fps.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform vec2 u_subjectSize;
uniform float u_pattern;   // 0 stripes, 1 dots, 2 grid, 3 crayon scribble
uniform float u_doodles;   // how many doodles
uniform float u_front;     // share of doodles drawn over the person's edge
uniform float u_border;    // sticker border width
uniform float u_boil;
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
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) {
  p.y += 0.55; p *= 1.6;
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float shape(int id, vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  if (id == 0) { float R = 0.18 + 0.2 * (0.5 + 0.5 * cos(5.0 * a)); return abs(r - R) * 0.9; }
  if (id == 1) return abs(sdHeart(p)) / 1.6;
  if (id == 2) { float s = fract(r * 7.0 - a / 6.2831853); return (r < 0.42 ? abs(s - 0.5) : 1.0) / 7.0 * 1.4; }
  if (id == 3) { float zz = 0.12 * (abs(fract(p.x * 3.0) - 0.5) * 4.0 - 1.0); return abs(p.y - zz) + (abs(p.x) > 0.4 ? 1.0 : 0.0); }
  if (id == 4) return abs(r - 0.33 - 0.03 * sin(a * 3.0 + 1.0));
  float d1 = abs(p.x - p.y) + (abs(p.x + p.y) > 0.55 ? 1.0 : 0.0);
  float d2 = abs(p.x + p.y) + (abs(p.x - p.y) > 0.55 ? 1.0 : 0.0);
  return min(d1, d2) * 0.7;
}
// doodle layer: rgb = crayon colour, a = ink. `front` picks the doodles drawn over the person, otherwise the ones behind.
vec4 doodles(vec2 q, float t, bool front) {
  float cellSize = 0.2;
  vec2 cell = floor(q / cellSize);
  vec4 best = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = cell + vec2(float(i), float(j));
    float isFront = step(hash(cc + 99.0), u_front);
    if ((isFront > 0.5) != front) continue;
    if (hash(cc + 21.3) > u_doodles) continue;
    float h = hash(cc * 1.37 + 3.1);
    vec2 centre = (cc + 0.15 + 0.7 * vec2(hash(cc + 7.7), hash(cc + 9.1))) * cellSize;
    vec2 p = (q - centre) / (cellSize * (0.8 + 0.5 * h));
    float ang = (h - 0.5) * 2.5 + (hash(vec2(t, cc.x + cc.y)) - 0.5) * 0.25;
    float cs = cos(ang), sn = sin(ang);
    p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
    p += (vec2(noise(p * 6.0 + t * 1.3 + h * 50.0), noise(p * 6.0 + 9.0 + t * 1.7 + h * 50.0)) - 0.5) * 0.06 * u_boil;
    int id = int(floor(hash(cc + 5.5) * 6.0));
    float w = 0.034 * (0.8 + 0.4 * noise(p * 14.0 + h * 9.0));
    float a = smoothstep(w, w * 0.45, shape(id, p)) * step(length(p), 0.62);
    a *= 0.55 + 0.45 * smoothstep(0.25, 0.6, noise(q * u_resolution.y * 0.5 + t * 3.0));
    if (a > best.a) {
      float k = hash(cc + 31.7) * 6.0;
      vec3 col = k < 1.0 ? vec3(1.0, 0.35, 0.45) : k < 2.0 ? vec3(1.0, 0.82, 0.2) : k < 3.0 ? vec3(0.3, 0.75, 1.0) : k < 4.0 ? vec3(0.45, 0.85, 0.4) : k < 5.0 ? vec3(0.75, 0.45, 1.0) : vec3(1.0, 0.6, 0.2);
      best = vec4(col, a);
    }
  }
  return best;
}
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
float dilate(vec2 uv, float r, float aspect) {
  float m = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 o = vec2(cos(a) / aspect, sin(a)) * r;
    m = max(m, maskAt(uv + o));
    m = max(m, maskAt(uv + o * 0.5));
  }
  return m;
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  float t = floor(u_time * 8.0);
  vec2 q = v_texCoord * vec2(aspect, 1.0);
  // patterned crayon paper
  float scale = 12.0;
  vec3 bg;
  if (u_pattern < 0.5) bg = mix(u_paperA, u_paperB, step(0.5, fract((q.x + q.y) * scale * 0.7)));
  else if (u_pattern < 1.5) { vec2 g = fract(q * scale * 0.6) - 0.5; bg = mix(u_paperA, u_paperB, smoothstep(0.27, 0.23, length(g))); }
  else if (u_pattern < 2.5) { vec2 g = abs(fract(q * scale * 0.55) - 0.5); bg = mix(u_paperA, u_paperB, step(0.44, max(g.x, g.y))); }
  else { float s = noise(vec2(dot(q, vec2(-0.57, 0.82)) * 90.0, dot(q, vec2(0.82, 0.57)) * 5.0 + t)); bg = mix(u_paperA, u_paperB, smoothstep(0.45, 0.75, s)); }
  bg *= 0.93 + 0.07 * noise(v_texCoord * u_resolution * 0.3);
  vec4 back = doodles(q, t, false);
  bg = mix(bg, back.rgb, back.a * 0.95);
  // the person as a paper sticker
  float m = smoothstep(0.35, 0.65, maskAt(v_texCoord));
  float wob = 1.0 + 0.25 * (noise(v_texCoord * 30.0 + t * 2.0) - 0.5) * u_boil;
  float ring = dilate(v_texCoord, u_border * wob, aspect);
  float shadow = dilate(v_texCoord - vec2(0.006 / aspect, -0.01), u_border * 1.1, aspect);
  vec3 col = bg * (1.0 - 0.32 * smoothstep(0.2, 0.9, shadow));
  col = mix(col, vec3(0.985, 0.975, 0.95) * (0.97 + 0.03 * noise(v_texCoord * u_resolution * 0.4)), smoothstep(0.3, 0.7, ring));
  col = mix(col, texture(u_input, v_texCoord).rgb, m);
  vec4 over = doodles(q, t, true);
  col = mix(col, over.rgb, over.a * 0.95);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
