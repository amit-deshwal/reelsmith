#version 300 es
precision highp float;
precision highp int;

// Liquid fill (Reels). Orange liquid cells bloom with thin veins between them, the veins pinch into
// droplets and the screen floods; then the next shot opens back through new cells. A section break; bold, modern.
// Adapted from GTKottman/remotion-transitions "liquid-fill" (MIT): the seeds are a jittered grid hashed in the shader
// (no seed array), searched in the 5x5 cells around each pixel.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 LIQUID = vec3(0.95, 0.38, 0.14);   // the warm brand orange of dip-to-colour
const float HOLD = 0.1;
const float ROWS = 6.0;
const float GAP = 0.0085;
const float WOBBLE = 0.012;

vec2 hash2(vec2 p, float s) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p + s * 17.13) * 43758.5453);
}
float hash1(vec2 p, float s) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + s * 3.17) * 43758.5453); }
float noise(vec2 p, float s) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i, s), f), dot(hash2(i + vec2(1, 0), s), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1), s), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1), s), f - vec2(1, 1)), u.x), u.y) * 1.4;
}
float fbm(vec2 p, float s) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p, s + float(i) * 7.0); p = p * 2.03 + 11.0; a *= 0.5; }
  return v;
}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float cover(float sdf) { float aa = max(fwidth(sdf) * 0.75, 0.0006); return 1.0 - smoothstep(-aa, aa, sdf); }


float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float easeOutCubic(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }

// Coverage of the liquid at phase time t. Every cell seed is a blob born at its own time; where two meet a vein of
// background stays between them, then the veins drop below zero in noisy patches and the screen floods.
float liquid(vec2 p, float t, float seed) {
  if (t <= 0.0) return 0.0;
  float cell = 1.0 / ROWS;
  float cols = ceil(u_aspect / cell);
  float cw = u_aspect / cols;
  float maxR = 1.6 / ROWS;
  vec2 w = vec2(noise(p * 3.1 + vec2(t * 1.3, 0.0), seed), noise(p * 3.1 + vec2(5.2, -t * 1.1), seed));
  vec2 q = p + w * WOBBLE;
  vec2 home = floor(vec2(q.x / cw, q.y / cell));
  float s1 = 1e3, s2 = 1e3, s3 = 1e3;
  for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
    vec2 g = home + vec2(dx, dy);
    if (g.x < -1.0 || g.x > cols || g.y < -1.0 || g.y > ROWS) continue;   // one ring of cells beyond the frame
    vec2 c = vec2((g.x + 0.5 + (hash1(g, seed) - 0.5) * 0.85) * cw, (g.y + 0.5 + (hash1(g + 31.0, seed) - 0.5) * 0.85) * cell);
    float birth = hash1(g + 57.0, seed) * 0.3;
    float rate = 1.0 / (0.3 + hash1(g + 83.0, seed) * 0.12);
    float grow = easeOutCubic((t - birth) * rate);
    float r = grow <= 0.0 ? -1.0 : mix(0.004, maxR, grow);
    float d = length(q - c) - r;
    if (d < s1) { s3 = s2; s2 = s1; s1 = d; }
    else if (d < s2) { s3 = s2; s2 = d; }
    else if (d < s3) { s3 = d; }
  }
  float border = smin((s2 - s1) * 0.5, (s3 - s1) * 0.5, GAP * 5.0);
  float merge = smoothstep(0.58, 0.94, t);
  float n = noise(p * 7.0 + 31.0, seed) * 0.5 + noise(p * 19.0 - 7.0, seed) * 0.18;
  float gap = GAP * (1.0 - merge * 2.2) + n * GAP * 1.6 * merge;
  float sdf = smax(s1, gap - border, GAP * 1.5);
  sdf -= smoothstep(0.9, 1.0, t) * 0.25;
  return cover(sdf);
}

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  vec3 c = LIQUID;
  float inEnd = 0.5 - HOLD / 2.0, outStart = 0.5 + HOLD / 2.0;
  vec3 col;
  if (pr < inEnd) col = mix(a, c, liquid(p, pr / inEnd, 3.0));
  else if (pr < outStart) col = c;
  else col = mix(c, b, liquid(p, (pr - outStart) / (1.0 - outStart), 4.0));
  if (pr >= 1.0) col = b;
  fragColor = vec4(col, 1.0);
}
