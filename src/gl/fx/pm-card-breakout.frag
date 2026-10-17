#version 300 es
precision highp float;
// Card breakout: the video shrinks into a rounded card on a dark background and the person steps out of it: they stay full size,
// overlapping the card's edges, while the rest of the scene stays boxed in. The card is scaled about the person so the full-size
// person covers their own shrunken copy.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform float u_card;      // card size relative to the frame
uniform float u_radius;
uniform float u_pulse;     // slow breathing of the card
uniform vec3 u_backColor;
in vec2 v_texCoord;
out vec4 fragColor;
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
float sdRound(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  float card = u_card * (1.0 + u_pulse * 0.025 * sin(u_time * 1.4));
  vec2 c = u_subjectCenter;
  vec2 lo = c * (1.0 - card), hi = c * (1.0 - card) + card;     // the frame scaled about the person
  vec2 mid = (lo + hi) * 0.5;
  vec2 p = (uv - mid) * vec2(aspect, 1.0);
  vec2 half_ = (hi - lo) * 0.5 * vec2(aspect, 1.0);
  float d = sdRound(p, half_, u_radius);
  vec3 bg = u_backColor * (1.0 - 0.25 * length(uv - 0.5));
  vec2 inner = c + (uv - c) / card;
  vec3 cardCol = texture(u_input, clamp(inner, 0.0, 1.0)).rgb;
  vec3 col = bg * (1.0 - 0.5 * smoothstep(0.05, 0.0, d + 0.0) * step(0.0, d));             // soft shadow just outside the card
  col = mix(col, cardCol, smoothstep(0.003, -0.003, d));
  col = mix(col, vec3(1.0), smoothstep(0.004, 0.0, abs(d)) * 0.55);                          // thin card edge
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  col = mix(col, texture(u_input, uv).rgb, m);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
