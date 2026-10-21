#version 300 es
precision highp float;
precision highp int;

// Datamosh strips (Reels). Horizontal strips smear and slip into the next shot like a corrupted file. Hype beats, gaming, music-video cuts.
// Adapted from GL Transitions "StripDatamoshGlitch" (MIT, gl-transitions contributors): wrapped in the two-input contract,
// tunable uniforms fixed at their defaults. Regenerate with server/reelsmith/import-gl-transitions.mts.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

float progress;
float ratio;
vec4 getFromColor(vec2 uv) { return texture(u_outgoing, uv); }
vec4 getToColor(vec2 uv) { return texture(u_incoming, uv); }

// ---- GL Transitions source ----
// Author: bread
// License: MIT
// Description: A datamosh glitch: torn strips, chroma shifts and scan noise drag the outgoing image into the incoming one
// Tags: glitch, datamosh, chromatic

const float strength = 1.0;
const float horizontalBars = 42.0;
const float verticalSlits = 18.0;
const float tear = 0.18;
const float chroma = 0.032;
const float residue = 0.62;
const float noiseAmount = 0.16;
const float scanAmount = 0.13;
const float flashAmount = 0.20;

const float PI = 3.141592653589793;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float sat(float v) {
  return clamp(v, 0.0, 1.0);
}

float burst() {
  return pow(max(0.0, sin(progress * PI)), 0.42) * strength;
}

vec2 safeUv(vec2 uv) {
  return clamp(uv, vec2(0.0), vec2(1.0));
}

float stripeY(vec2 uv, float density, float seed, float minWidth, float maxWidth) {
  float y = uv.y * density + seed * 0.137;
  float id = floor(y);
  float f = fract(y);
  float c = hash(vec2(id, seed));
  float w = mix(minWidth, maxWidth, hash(vec2(id + 9.17, seed + 2.31)));
  return 1.0 - smoothstep(w, w + 0.018, abs(f - c));
}

float stripeX(vec2 uv, float density, float seed, float minWidth, float maxWidth) {
  float x = uv.x * density + seed * 0.091;
  float id = floor(x);
  float f = fract(x);
  float c = hash(vec2(id, seed + 41.0));
  float w = mix(minWidth, maxWidth, hash(vec2(id + 4.7, seed + 8.9)));
  return 1.0 - smoothstep(w, w + 0.012, abs(f - c));
}

float brokenGate(vec2 uv, float row, float rnd, float frame) {
  float segs = mix(1.0, 9.0, hash(vec2(row, frame + 44.0)));
  float seg = floor(uv.x * segs);
  return step(0.16, hash(vec2(seg, row + frame * 3.0 + rnd)));
}

float horizontalMask(vec2 uv, float frame) {
  float r1 = floor((uv.y + hash(frame) * 0.031) * horizontalBars * 0.38);
  float r2 = floor((uv.y + hash(frame + 2.0) * 0.013) * horizontalBars);
  float r3 = floor((uv.y + hash(frame + 7.0) * 0.006) * horizontalBars * 3.4);

  float thick = stripeY(uv, horizontalBars * 0.38, frame + 1.0, 0.035, 0.22);
  float mid   = stripeY(uv, horizontalBars,        frame + 4.0, 0.014, 0.11);
  float hair  = stripeY(uv, horizontalBars * 3.4,  frame + 9.0, 0.004, 0.035);

  thick *= step(0.42, hash(vec2(r1, frame + 10.0)));
  mid   *= step(0.48, hash(vec2(r2, frame + 20.0)));
  hair  *= step(0.62, hash(vec2(r3, frame + 30.0)));

  thick *= brokenGate(uv, r1, hash(vec2(r1, frame)), frame);
  mid   *= brokenGate(uv, r2, hash(vec2(r2, frame)), frame + 3.0);

  return sat(max(thick, max(mid, hair)));
}

float verticalMask(vec2 uv, float frame) {
  float col = floor((uv.x + hash(frame + 12.0) * 0.017) * verticalSlits);
  float slit = stripeX(uv, verticalSlits, frame + 13.0, 0.01, 0.075);
  slit *= step(0.66, hash(vec2(col, frame + 19.0)));
  return sat(slit);
}

vec4 chromaFrom(vec2 uv, vec2 s) {
  uv = safeUv(uv);
  return vec4(
    getFromColor(safeUv(uv + s)).r,
    getFromColor(uv).g,
    getFromColor(safeUv(uv - s)).b,
    1.0
  );
}

vec4 chromaTo(vec2 uv, vec2 s) {
  uv = safeUv(uv);
  return vec4(
    getToColor(safeUv(uv - s)).r,
    getToColor(uv).g,
    getToColor(safeUv(uv + s)).b,
    1.0
  );
}

vec2 distortUv(vec2 uv, float dir, float b, float h, float v, float frame) {
  float row = floor(uv.y * horizontalBars);
  float col = floor(uv.x * verticalSlits);

  float rowRnd = hash(vec2(row, frame));
  float colRnd = hash(vec2(col, frame + 27.0));

  float xTear = (rowRnd - 0.5) * 2.0 * tear * b * h;
  xTear += sin(uv.y * 120.0 + progress * 95.0) * 0.006 * b;

  float yDrag = (colRnd - 0.5) * 0.13 * b * v;
  float micro = (hash(vec2(row, col + frame)) - 0.5) * 0.018 * b * max(h, v);

  return uv + vec2(xTear * dir + micro, yDrag);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);

  float b = burst();
  float frame = floor(progress * 30.0);

  float h = horizontalMask(uv, frame);
  float v = verticalMask(uv, frame);
  float glitch = sat(max(h, v * 0.75));

  float row = floor(uv.y * horizontalBars);
  float rowRnd = hash(vec2(row, frame + 5.0));

  float bandDelay = (rowRnd - 0.5) * 0.30 * h;
  float reveal = smoothstep(0.18, 0.84, progress + bandDelay);

  vec2 split = vec2(chroma * b * (1.0 + 1.7 * glitch), chroma * 0.22 * b * v);

  vec2 fromUv = distortUv(uv,  1.0, b, h, v, frame);
  vec2 toUv   = distortUv(uv, -1.0, b, h, v, frame);

  vec4 color = mix(
    chromaFrom(fromUv, split),
    chromaTo(toUv, split),
    reveal
  );

  // Horizontal time-slice residue: old/new frames dragged through uneven scan bands.
  vec2 smearUv = uv;
  smearUv.x += (rowRnd - 0.5) * 0.46 * b * h;
  smearUv.y += (hash(vec2(row, frame + 31.0)) - 0.5) * 0.045 * b * h;

  float sliceReveal = smoothstep(0.28, 0.78, progress + (rowRnd - 0.5) * 0.22);
  vec4 sliceColor = mix(
    chromaFrom(smearUv, split * 1.65),
    chromaTo(smearUv - vec2((rowRnd - 0.5) * 0.18 * b, 0.0), split * 1.65),
    sliceReveal
  );

  color = mix(color, sliceColor, h * b * residue);

  // Thin scan sparks and broken white lines, like the reference clip's bright horizontal noise.
  float hairLine = stripeY(uv, 190.0, frame + 55.0, 0.002, 0.012);
  hairLine *= step(0.70, hash(vec2(floor(uv.y * 190.0), frame + 56.0)));
  color.rgb += vec3(0.72, 0.90, 1.0) * hairLine * b * 0.28;

  float scan = 0.5 + 0.5 * sin(uv.y * 980.0 + progress * 130.0);
  color.rgb *= 1.0 - scanAmount * b * scan;

  vec2 nCell = floor(uv * vec2(360.0 * ratio, 210.0));
  float n = hash(nCell + vec2(frame * 7.0, frame * 13.0));
  color.rgb += (n - 0.5) * noiseAmount * b * (0.55 + glitch);

  // Slight desaturation during the damage peak makes it feel more like broadcast/video signal corruption.
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(color.rgb, vec3(luma), 0.18 * b * glitch);

  float strobe = step(0.78, hash(vec2(frame, 3.14))) * pow(b, 1.65);
  color.rgb += vec3(strobe * flashAmount);

  return vec4(clamp(color.rgb, vec3(0.0), vec3(1.0)), 1.0);
}

// ---- end ----

// ---- Reelsmith polish: ease-in-out timing, motion blur over nearby moments, colour fringe along the motion ----
const float RS_BLUR = 0.0;
const float RS_SPLIT = 0.0;
const int RS_TAPS = 7;
float rs_ease(float p) { return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; }
float rs_speed(float p) { float q = min(p, 1.0 - p); return 4.0 * q * q; }   // the ease's slope, 1 at the middle
vec3 rs_at(float t) { progress = t; return transition(v_texCoord).rgb; }

void main() {
  ratio = u_aspect;
  float e = rs_ease(u_progress);
  float spread = RS_BLUR * rs_speed(u_progress);
  if (spread <= 0.0) { fragColor = vec4(rs_at(e), 1.0); return; }
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < RS_TAPS; i++) {
    float k = float(i) / float(RS_TAPS - 1) - 0.5;
    vec3 w = vec3(1.0 + RS_SPLIT * 2.0 * k, 1.0, 1.0 - RS_SPLIT * 2.0 * k);   // red leans ahead, blue behind
    acc += rs_at(clamp(e + k * spread, 0.0, 1.0)) * w;
    wsum += w;
  }
  fragColor = vec4(acc / wsum, 1.0);
}
