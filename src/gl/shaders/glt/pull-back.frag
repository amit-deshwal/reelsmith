#version 300 es
precision highp float;
precision highp int;

// Pull back (Reels). The camera pulls away: the shot shrinks toward the middle with radial streaks and mirrored copies
// filling the edges, and the next shot, still too close, keeps pulling back into place. The reverse of a punch-in:
// revealing a view, stepping back to show where you are, an ending.
// Reelsmith original, after the "pull out" zoom cut of mobile editors.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const int TAPS = 10;
const float BLUR = 0.16;

float easeInOut(float p) { return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; }

vec2 mirror(vec2 q) { return abs(mod(q + 1.0, 2.0) - 1.0); }

// the shot seen at magnification m (below 1 = smaller, the edges mirrored), blurred along the radius by `streak`
vec3 zoomed(sampler2D tex, vec2 uv, float m, float streak) {
  vec2 c = vec2(0.5);
  vec2 d = uv - c;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float k = float(i) / float(TAPS - 1);
    float mm = m * (1.0 + streak * k);       // taps further toward the camera: streaks point outward
    acc += texture(tex, mirror(c + d / mm)).rgb;
  }
  return acc / float(TAPS);
}

void main() {
  vec2 uv = v_texCoord;
  float p = clamp(u_progress, 0.0, 1.0);
  float e = easeInOut(p);
  float speed = 1.0 - abs(2.0 * p - 1.0);    // 0 at the ends, 1 at the cut
  float streak = BLUR * speed;
  vec3 col;
  if (e < 0.5) {
    float m = mix(1.0, 0.55, e / 0.5);
    col = zoomed(u_outgoing, uv, m, streak);
  } else {
    float m = mix(1.8, 1.0, (e - 0.5) / 0.5);
    col = zoomed(u_incoming, uv, m, streak);
  }
  // a soft flash hides the swap
  col += 0.12 * speed * speed * speed;
  if (p <= 0.0) col = texture(u_outgoing, uv).rgb;
  if (p >= 1.0) col = texture(u_incoming, uv).rgb;
  fragColor = vec4(col, 1.0);
}
