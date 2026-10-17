#version 300 es
precision highp float;
// Movie title reveal: a heavy, cracked and chipped weathered-steel title sits inside a disc of dark glass rings cut from the
// footage. The rings open from the centre, each split into segments that light up at random, spinning in opposite directions as
// they settle; each ring is a cylindrical lens that bends the footage and shows it turned a little further than the ring inside
// it (the spiral). The footage outside the disc stays moody and the title lets the picture show through. u_text holds the
// title (white on black, with a margin).
uniform sampler2D u_input;
uniform sampler2D u_text;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_textAspect;   // width / height of the title cell
uniform float u_reveal;       // seconds the reveal takes
uniform float u_rings;
uniform float u_glass;        // how strongly the glass bends the footage
uniform float u_twist;        // how far each ring turns the picture from the one inside it
uniform float u_span;         // size of the ring disc, 1 = about the frame width
uniform float u_size;         // title width as a share of the frame
uniform float u_wear;         // weathering: scratches, rust, scraped edges
uniform float u_dim;          // darken the footage outside the glass
uniform vec3 u_steel;
in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.7) + 0.0625 * vnoise(p * 8.3 + 1.3); }
vec2 fold(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }   // mirrored repeat, so rotated rings never hit the edge
float ease(float t) { t = clamp(t, 0.0, 1.0); return 1.0 - pow(1.0 - t, 3.0); }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

float cover(vec2 t) {
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) return 0.0;
  return texture(u_text, t).r;
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 asp = vec2(aspect, 1.0);
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float T = clamp(u_time / max(u_reveal, 0.05), 0.0, 1.0);

  // ---- title placement: a cell of width cellW (share of frame width), centred, settling from slightly larger
  float tt = ease((T - 0.38) / 0.62);
  float cellW = min(u_size, 0.8 * u_textAspect / aspect);
  float cellH = cellW / u_textAspect * aspect;
  float grow = 1.0 + (1.0 - tt) * 0.14;
  vec2 tuv = vec2((uv.x - 0.5) / (cellW * grow) + 0.5, (uv.y - 0.5) / (cellH * grow) + 0.5);
  vec2 pxc = vec2(1.0 / (cellW * grow * u_resolution.x), 1.0 / (cellH * grow * u_resolution.y));
  float cov = cover(tuv);
  float titleBlur = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    titleBlur += cover(tuv + vec2(cos(a), sin(a)) * pxc * 22.0);
  }
  titleBlur = (titleBlur + cov) / 9.0;

  // ---- backdrop: the footage, moodier, darker behind the title and around the disc
  vec2 P = (uv - 0.5) * asp;
  float r = length(P);
  float Rmax = 0.5 * min(aspect, 1.0) * u_span;
  float R0 = Rmax * 0.1;
  float halo = smoothstep(Rmax * 1.45, Rmax * 0.9, r) * ease(T * 1.6);
  vec3 col = src * (1.0 - u_dim) * (1.0 - 0.45 * halo) * (1.0 - 0.4 * titleBlur);

  // ---- dark glass rings in segments
  float N = floor(u_rings + 0.5);
  float s = (r - R0) / (Rmax - R0) * N;
  float inRing = step(0.0, s) * step(s, N);
  s = clamp(s, 0.0, N - 0.001);
  float k = floor(s);
  float t = fract(s);
  float ringW = (Rmax - R0) / N;
  float dirk = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
  float tk = ease((T - 0.5 * k / N) / 0.5);
  float turn = dirk * ((1.0 - tk) * (1.0 - tk) * 2.6 + k * 0.13 * u_twist + u_time * 0.06 * (0.6 + 0.12 * k));
  float nseg = 6.0 + 3.0 * k;
  float ang01 = atan(P.y, P.x) / 6.2831853 + 0.5 + turn / 6.2831853;
  float sc = ang01 * nseg;
  float sid = floor(sc);
  float sf = fract(sc);
  float hseg = hash(vec2(k, mod(sid, nseg)) + 3.1);
  float lit = ease((T - 0.55 * k / N - 0.3 * hseg) / 0.35);         // segments come on one by one
  float flick = 0.7 + 0.3 * sin(u_time * (0.6 + hseg * 1.4) + hseg * 40.0);
  float x = t * 2.0 - 1.0;
  float hgt = sqrt(max(0.0, 1.0 - x * x));
  vec2 radial = P / max(r, 1e-4);
  float zoom = 1.0 + 0.04 * u_twist * k;
  vec3 glass;
  for (int c = 0; c < 3; c++) {
    float bend = 1.0 + float(c) * 0.09;
    vec2 Q = P - radial * (x * u_glass * ringW * 0.9 * bend);
    Q = rot(Q, turn) / zoom;
    vec3 smp = texture(u_input, fold(0.5 + Q / asp)).rgb;
    glass[c] = c == 0 ? smp.r : (c == 1 ? smp.g : smp.b);
  }
  glass = glass * (0.3 + 0.38 * hgt) * (0.55 + 0.45 * lit * flick) + vec3(0.01, 0.015, 0.015);   // smoked glass
  float edgeBright = smoothstep(0.8, 1.0, abs(x)) * (0.3 + 0.7 * max(cos(atan(P.y, P.x) - 2.2 + u_time * 0.3), 0.0));
  glass += vec3(0.95, 0.93, 0.85) * edgeBright * 0.22;
  float body = smoothstep(0.0, 0.05, t) * smoothstep(0.0, 0.05, 1.0 - t) * smoothstep(0.0, 0.02, sf) * smoothstep(0.0, 0.02, 1.0 - sf);
  float line = 1.0 - body;                                           // dark seams between rings and segments
  float vis = inRing * tk * smoothstep(0.0, 0.5, lit + 0.25);
  col = mix(col, glass, body * vis);
  col = mix(col, vec3(0.02, 0.025, 0.025), line * vis * 0.85);
  col += vec3(0.85, 0.85, 0.78) * exp(-pow((t - 0.03) / 0.025, 2.0)) * 0.16 * vis;   // thin lit rim on each ring
  col = mix(col, src * (1.0 - u_dim * 0.5) * (1.0 - 0.4 * titleBlur), (1.0 - inRing) * step(r, R0) * ease(T * 2.0));

  // ---- the title: cracked, chipped weathered metal with the picture showing through
  float roughN = fbm(tuv * vec2(46.0, 26.0));
  float edgeProx = clamp(1.2 - titleBlur * 1.7, 0.0, 1.0);
  float eroded = cov - (roughN - 0.34) * u_wear * 1.05 * edgeProx;
  float pits = step(0.8, vnoise(tuv * vec2(120.0, 70.0))) * u_wear * 0.55;
  float m = smoothstep(0.45, 0.58, eroded) * (1.0 - pits);
  float gx = 0.0, gy = 0.0;
  for (int i = 0; i < 2; i++) {
    float R = i == 0 ? 7.0 : 2.5;
    float wgt = i == 0 ? 0.6 : 0.4;
    gx += wgt * (cover(tuv + vec2(R * pxc.x, 0.0)) - cover(tuv - vec2(R * pxc.x, 0.0)));
    gy += wgt * (cover(tuv + vec2(0.0, R * pxc.y)) - cover(tuv - vec2(0.0, R * pxc.y)));
  }
  float depth = clamp(titleBlur * 1.6, 0.0, 1.0);
  vec3 n = normalize(vec3(-gx * 1.1, -gy * 1.1, 0.6 + depth * 0.4));
  vec3 L = normalize(vec3(-0.5, 0.65, 0.6));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spc = pow(clamp(dot(n, H), 0.0, 1.0), 38.0);
  float grain = vnoise(vec2(tuv.x * 18.0, tuv.y * 160.0)) * 0.5 + fbm(tuv * vec2(70.0, 45.0)) * 0.9;
  // cracks: distance to the nearest cell edge of a jittered grid
  vec2 cp = tuv * vec2(15.0, 9.0);
  vec2 ci = floor(cp), cf = fract(cp);
  float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = 0; i < 3; i++) {
    vec2 g = vec2(float(i - 1), float(j));
    vec2 o = vec2(hash(ci + g), hash(ci + g + 17.3));
    float d = length(g + o - cf);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float crack = smoothstep(0.11, 0.0, d2 - d1) * (0.5 + 0.5 * vnoise(tuv * 60.0)) * u_wear;
  float stain = smoothstep(0.45, 0.8, fbm(tuv * vec2(5.0, 3.2) + 4.0)) * u_wear;
  vec3 steel = u_steel * (0.3 + 0.7 * diff) * (0.45 + 0.65 * grain);
  steel *= 1.0 - 0.7 * stain;
  steel = mix(steel, vec3(0.2, 0.14, 0.1) * (0.5 + diff), stain * 0.25);   // faint rust in the stains
  steel *= 1.0 - 0.85 * crack;
  steel += vec3(0.95, 0.97, 1.0) * spc * 0.35;
  float edge = clamp((cov - titleBlur) * 2.6, 0.0, 1.0);
  steel = mix(steel, u_steel * 1.15, edge * 0.35);
  steel = mix(steel, src * 1.15 + steel * 0.25, 0.3);                // the picture shows through the stone
  float sweepX = fract(u_time * 0.2 + 0.15) * 1.8 - 0.4;
  steel += vec3(0.9, 0.95, 1.0) * exp(-pow((tuv.x + tuv.y * 0.35 - sweepX) * 6.0, 2.0)) * 0.12 * (0.4 + diff);

  float sh = cover(tuv + vec2(-0.012 / cellW * 0.6, 0.02 / cellH * 0.6)) * 0.5 + titleBlur * 0.5;
  col *= 1.0 - 0.55 * sh * (1.0 - m) * tt;
  col = mix(col, steel, m * tt);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
