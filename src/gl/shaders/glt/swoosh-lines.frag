#version 300 es
precision highp float;
precision highp int;

// Swoosh lines (Reels). Rounded diagonal ribbons swoosh in from the left in two staggered waves, near-black then
// orange, until the screen is covered; then the top wave swooshes on out to the right onto the next shot.
// A section break, sport, energetic intros. Adapted from GTKottman/remotion-transitions "swoosh-lines" (MIT): the ribbons
// are capsules in a rotated frame with motion-blurred ends.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 RIBBON = vec3(0.95, 0.38, 0.14);   // the warm brand orange of dip-to-colour; the first wave is near-black
const float HOLD = 0.1;
const float RIBBONS = 7.0;
const float ANGLE = -0.4887;   // -28 degrees
const int TAPS = 11;

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


float seg(float p, float a, float b) { return clamp((p - a) / (b - a), 0.0, 1.0); }
float inOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

// Which wave covers the point at phase time t: -1 none, else the wave index (the later wave is on top).
// in: waves 0 and 1 slide from far left to covering. out: wave 1 slides from covering to far right.
float waveAt(vec2 q, float t, bool phaseIn, float D, float h, float dx) {
  float j = floor((q.y + D * 0.5) / h);
  if (j < 0.0 || j >= RIBBONS) return -1.0;
  float yc = (j + 0.5) * h - D * 0.5;
  float lx = q.x + D * 0.5 + dx;
  float hit = -1.0;
  int waves = phaseIn ? 2 : 1;
  float delay = phaseIn ? 0.22 : 0.0;
  float span = 1.0 - delay * float(waves - 1);
  for (int wv = 0; wv < 2; wv++) {
    if (wv >= waves) break;
    float start = float(wv) * delay + (j / RIBBONS) * span * 0.45;
    float k = inOutCubic(seg(t, start, start + span * 0.55));
    float x = phaseIn ? (k - 1.0) * (D + h) : k * (D + h);
    // capsule from x to x + D along the ribbon, radius h/2 (+ a hair so neighbours meet)
    float cx = clamp(lx, x, x + D);
    if (length(vec2(lx - cx, q.y - yc)) < h * 0.5 + 0.002) hit = phaseIn ? float(wv) : 1.0;
  }
  return hit;
}

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  vec3 dark = vec3(0.067);
  vec3 c = RIBBON;
  float D = length(vec2(u_aspect, 1.0)) * 1.15;   // side of a rotated square that still covers the frame
  float h = D / RIBBONS;
  vec2 o = p - vec2(u_aspect, 1.0) * 0.5;
  float cs = cos(ANGLE), sn = sin(ANGLE);
  vec2 q = vec2(cs * o.x + sn * o.y, -sn * o.x + cs * o.y);
  float inEnd = 0.5 - HOLD / 2.0, outStart = 0.5 + HOLD / 2.0;
  bool phaseIn = pr < inEnd;
  float t = phaseIn ? pr / inEnd : (pr - outStart) / (1.0 - outStart);
  vec3 under = phaseIn ? a : b;
  if (!phaseIn && pr < outStart) { fragColor = vec4(c, 1.0); return; }
  // motion blur: the ribbons' ends are averaged over a short stretch along their travel, longest at full speed
  float blur = sin(3.14159265 * clamp(t, 0.0, 1.0)) * h * 0.9;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float dx = (float(i) / float(TAPS - 1) - 0.5) * blur;
    float wv = waveAt(q, t, phaseIn, D, h, dx);
    acc += wv < 0.0 ? under : (wv < 0.5 ? dark : c);
  }
  vec3 col = acc / float(TAPS);
  if (pr >= 1.0) col = b;
  fragColor = vec4(col, 1.0);
}
