#version 300 es
precision highp float;
precision highp int;

// Lens cover (Reels). A palm sweeps across the lens: a dark, out-of-focus shape with a warm glow at its edge (light
// through skin) covers the shot from the right, holds black for a moment, then slides off to the left onto the next
// shot, which lands a touch zoomed and over-bright and settles, the way a phone's exposure catches up. The reset before
// a drop, a new place, a reveal.
// Reelsmith original, after the hand-over-lens cut in creator travel reels (Kino's Torna Fort cut).
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float HOLD = 0.06;       // share of the transition spent fully covered
const float SOFT = 0.11;       // edge softness: the hand is far too close to be in focus
const vec3 SKIN = vec3(0.42, 0.13, 0.06);
const vec3 DARK = vec3(0.012, 0.008, 0.007);

// a gentle ease: the hand keeps moving across the whole frame instead of jumping through the middle
float easeInOut(float p) { return 0.5 - 0.5 * cos(3.14159265 * p); }

// Where the hand's edge crosses this row: a palm-shaped bulge that leads in the middle, tilted a little.
float edgeX(float base, float y) {
  float c = 2.0 * y - 1.0;
  return base - 0.16 * (1.0 - c * c) / max(u_aspect * 1.78, 0.4) + 0.06 * c;
}

// d > 0 inside the hand. The colour of the hand at this depth, over `scene`.
vec3 hand(vec3 scene, float d) {
  float cover = smoothstep(-SOFT * 0.5, SOFT, d);
  float rim = exp(-max(d, 0.0) * 7.0) * cover;
  vec3 skin = DARK + SKIN * rim;
  return mix(scene, skin, cover);
}

void main() {
  vec2 uv = v_texCoord;
  float p = clamp(u_progress, 0.0, 1.0);
  float half1 = 0.5 - HOLD * 0.5;
  float half2 = 0.5 + HOLD * 0.5;
  vec3 col;
  if (p < half1) {
    // the hand comes in from the right; the shot dims and the camera leans toward it
    float t = easeInOut(p / half1);
    float zoom = 1.0 + 0.035 * t;
    vec3 scene = texture(u_outgoing, (uv - 0.5) / zoom + 0.5).rgb * (1.0 - 0.3 * t);
    float e = mix(1.15, -0.45, t);
    col = hand(scene, uv.x - edgeX(e, uv.y));
  } else if (p < half2) {
    col = DARK;
  } else {
    // the hand slides off to the left; the next shot settles from a slight zoom and an exposure pop
    float t = easeInOut((p - half2) / (1.0 - half2));
    float zoom = 1.07 - 0.07 * t;
    vec3 scene = texture(u_incoming, (uv - 0.5) / zoom + 0.5).rgb;
    float pop = (1.0 - t) * (1.0 - t);
    scene = scene * (1.0 + 0.45 * pop) + 0.04 * pop;
    float e = mix(1.15, -0.45, t);
    col = hand(scene, edgeX(e, uv.y) - uv.x);
  }
  // the very ends are the plain shots
  if (p <= 0.0) col = texture(u_outgoing, uv).rgb;
  if (p >= 1.0) col = texture(u_incoming, uv).rgb;
  fragColor = vec4(col, 1.0);
}
