#version 300 es
precision highp float;
precision highp int;

// Split slices (Reels). The shot is cut into horizontal strips that slide off left and right in turn, staggered and
// motion-blurred with a colour fringe, while the next shot settles from a slight zoom behind them. Hype beats, fashion,
// a fast list of places. Adapted from GTKottman/remotion-transitions "split-slices" (MIT), with the blur added.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float SLICES = 7.0;
const float STAGGER = 0.35;
const int TAPS = 7;

float seg(float p, float a, float b) { return clamp((p - a) / (b - a), 0.0, 1.0); }
float inOutQuint(float t) { return t < 0.5 ? 16.0 * t * t * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 5.0) / 2.0; }
float outCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }

vec3 frameAt(vec2 uv, float t) {
  float i = min(floor((1.0 - uv.y) * SLICES), SLICES - 1.0);
  float start = i / (SLICES - 1.0) * STAGGER;
  float q = inOutQuint(seg(t, start, start + 1.0 - STAGGER));
  float sg = mod(i, 2.0) > 0.5 ? 1.0 : -1.0;
  float x = uv.x - sg * q * 1.02;
  if (x >= 0.0 && x <= 1.0) return texture(u_outgoing, vec2(x, uv.y)).rgb;
  float s = mix(1.06, 1.0, outCubic(t));
  return texture(u_incoming, (uv - 0.5) / s + 0.5).rgb;
}

void main() {
  float pr = u_progress;
  if (pr <= 0.0 || pr >= 1.0) { fragColor = vec4(pr <= 0.0 ? texture(u_outgoing, v_texCoord).rgb : texture(u_incoming, v_texCoord).rgb, 1.0); return; }
  float spread = 0.07 * sin(3.14159265 * pr);
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float k = float(i) / float(TAPS - 1) - 0.5;
    vec3 w = vec3(1.0 + 1.2 * k, 1.0, 1.0 - 1.2 * k);
    acc += frameAt(v_texCoord, clamp(pr + k * spread, 0.0, 1.0)) * w;
    wsum += w;
  }
  fragColor = vec4(acc / wsum, 1.0);
}
