#version 300 es
precision highp float;

// Mirror flip (Reels). The frame flips like a coin on the beat: the shot squeezes to a bright line, and the next shot opens
// out of it as its mirror side, settling the right way round. Before/after reveals, outfit changes, a beat drop.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_vertical;  // 1 = flip top over bottom

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  float e = p * p * (3.0 - 2.0 * p);
  float w = cos(3.14159265 * e);             // 1 .. 0 .. -1: width of the card, negative = its back
  vec2 uv = v_texCoord;
  float t = u_vertical > 0.5 ? uv.y : uv.x;
  float x = (t - 0.5) / (abs(w) + 1e-4) + 0.5;
  float line = max(sin(3.14159265 * p), 0.0);
  if (x < 0.0 || x > 1.0) { fragColor = vec4(vec3(0.0), 1.0); return; }
  vec2 suv = u_vertical > 0.5 ? vec2(uv.x, x) : vec2(x, uv.y);
  vec3 col = w >= 0.0 ? texture(u_outgoing, suv).rgb : texture(u_incoming, suv).rgb;
  col = mix(col, vec3(1.0), line * line * 0.35);
  fragColor = vec4(col, 1.0);
}
