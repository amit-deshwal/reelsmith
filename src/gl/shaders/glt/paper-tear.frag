#version 300 es
precision highp float;
precision highp int;

// Paper tear (Reels). A ragged tear runs top to bottom with torn white paper fibres along it; the two halves pull apart,
// tilting away from their bottom corners and casting a shadow on the next shot below. Scrapbook, journals, a playful
// reveal. Adapted from GTKottman/remotion-transitions "paper-tear" (MIT), with motion blur on the halves.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 PAPER = vec3(0.969, 0.961, 0.941);
const float ROUGH = 0.1;
const int TAPS = 5;

float hash(float n, float s) { return fract(sin(n * 12.9898 + s * 78.233) * 43758.5453); }
float noise1(float x, float s) {
  float i = floor(x), f = fract(x);
  return mix(hash(i, s) * 2.0 - 1.0, hash(i + 1.0, s) * 2.0 - 1.0, f * f * (3.0 - 2.0 * f));
}
float fbm1(float x, float s) {
  float v = 0.0, amp = 0.5, freq = 1.0;
  for (int o = 0; o < 3; o++) { v += amp * noise1(x * freq, s + float(o) * 17.0); amp *= 0.5; freq *= 2.1; }
  return v * 1.6;
}
float inOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// The tear's x at a height (y down), and the width of the paper fringe there.
float tearX(float y) { float k = y * 90.0; return u_aspect * 0.5 + fbm1(k * 0.35, 1.0) * ROUGH * u_aspect + fbm1(k * 2.3, 6.0) * ROUGH * u_aspect * 0.15; }
float fringe(float y) { return (4.0 + abs(fbm1(y * 90.0 * 1.7, 10.0)) * 16.0) / 1080.0; }

// The frame at eased time q: each half of the outgoing shot pulled aside over the incoming one.
vec3 frameAt(vec2 p, float q, vec3 b) {
  float W = u_aspect;
  float shadow = 0.0;
  for (int side = 0; side < 2; side++) {
    float sg = side == 0 ? -1.0 : 1.0;
    vec2 o = vec2(side == 0 ? 0.0 : W, 1.0);   // the bottom corner it tilts from
    vec2 l = o + rot(p - o - vec2(sg * q * 0.62 * W, 0.0), -sg * q * 0.1222);   // undo translate then rotate (7 degrees)
    float tx = tearX(l.y), fr = fringe(l.y);
    float d = sg < 0.0 ? l.x - (tx + fr) : (tx - fr) - l.x;   // > 0 outside this half, past the paper edge
    bool inY = l.y >= 0.0 && l.y <= 1.0;
    if (inY && d <= 0.0 && l.x >= 0.0 && l.x <= W) {
      bool picture = sg < 0.0 ? l.x < tx : l.x > tx;
      return picture ? texture(u_outgoing, vec2(l.x / W, 1.0 - l.y)).rgb : PAPER;
    }
    float dy = max(l.y - 1.0, 0.0);
    shadow = max(shadow, (1.0 - smoothstep(0.0, 0.03, max(d, 0.0) + dy)) * 0.35 * min(q * 6.0, 1.0));
  }
  return b * (1.0 - shadow);
}

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  if (pr <= 0.0) { fragColor = vec4(texture(u_outgoing, v_texCoord).rgb, 1.0); return; }
  if (pr >= 1.0) { fragColor = vec4(b, 1.0); return; }
  float spread = 0.06 * sin(3.14159265 * pr);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float t = clamp(pr + (float(i) / float(TAPS - 1) - 0.5) * spread, 0.0, 1.0);
    acc += frameAt(p, inOutCubic(t), b);
  }
  fragColor = vec4(acc / float(TAPS), 1.0);
}
