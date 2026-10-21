#version 300 es
precision highp float;
precision highp int;

// Flare sweep (Reels). A flare travels across a horizontal line: a wide, thin anamorphic streak, a round bloom that grows
// until it whites out the frame at the cut, and two faint lens ghosts mirrored through the centre. Screen-blended, so it
// only ever brightens. Night, city lights, cinematic travel. Adapted from GTKottman/remotion-transitions "flare-sweep" (MIT).
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 TINT = vec3(0.498, 0.784, 1.0);   // anamorphic blue
const float LINE_Y = 0.5;

float inCubic(float t) { return t * t * t; }
float outCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }
vec3 screen(vec3 base, vec3 layer) { return 1.0 - (1.0 - base) * (1.0 - layer); }

void main() {
  float pr = u_progress;
  float W = u_aspect;
  vec2 p = vec2(v_texCoord.x * W, 1.0 - v_texCoord.y);
  bool phaseIn = pr < 0.5;
  float t = phaseIn ? pr * 2.0 : pr * 2.0 - 1.0;
  vec3 col = phaseIn ? texture(u_outgoing, v_texCoord).rgb : texture(u_incoming, v_texCoord).rgb;
  if (pr <= 0.0 || pr >= 1.0) { fragColor = vec4(col, 1.0); return; }
  float k = phaseIn ? inCubic(t) : 1.0 - outCubic(t);
  float fx = phaseIn ? mix(-0.15 * W, 0.5 * W, outCubic(t)) : mix(0.5 * W, 1.15 * W, inCubic(t));
  vec2 f = vec2(fx, LINE_Y);
  float diag = length(vec2(W, 1.0));
  float r = mix(0.08, diag * 2.2, pow(k, 2.2));

  // bloom: white core, tinted shoulder, soft falloff
  float d = length(p - f) / r;
  vec3 bloom = d < 0.45 ? vec3(1.0) : d < 0.7 ? mix(vec3(1.0), TINT * 0.9, (d - 0.45) / 0.25) : mix(TINT * 0.9, vec3(0.0), clamp((d - 0.7) / 0.3, 0.0, 1.0));
  col = screen(col, bloom * min(1.0, 0.35 + k));
  // anamorphic streak: a very wide, thin ellipse
  float e = length((p - f) / vec2(0.75 * W * 1.6, 0.022 + k * 0.05));
  vec3 streak = e < 0.3 ? mix(vec3(1.0), TINT * 0.95, e / 0.3) : mix(TINT * 0.95, vec3(0.0), clamp((e - 0.3) / 0.7, 0.0, 1.0));
  col = screen(col, streak);
  // lens ghosts through the centre
  for (int i = 0; i < 2; i++) {
    float m = i == 0 ? 0.6 : 1.25;
    vec2 g = vec2(W * 0.5, 0.5) + (vec2(W * 0.5, 0.5) - f) * m;
    float gr = 0.05 * float(i + 1);
    float gd = length(p - g);
    float disc = (1.0 - smoothstep(gr - 0.002, gr, gd)) * 0.18 + exp(-abs(gd - gr) * 900.0) * 0.3;
    col = screen(col, TINT * disc * (1.0 - k));
  }
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
