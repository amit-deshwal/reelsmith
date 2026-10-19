#version 300 es
precision highp float;

// Brush wipe (Reels). The next shot is painted on in a few thick brush strokes, one after another and alternating
// direction, with ragged bristle edges and a dark ink line at each stroke's front. Art, journals, handmade stories.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_strokes;   // number of strokes, top to bottom

in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float p = u_progress;
  vec2 uv = v_texCoord;
  float rows = max(u_strokes, 1.0);
  float row = min(floor((1.0 - uv.y) * rows), rows - 1.0);
  float start = row / rows * 0.4;
  float t = clamp((p - start) / 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float x = mod(row, 2.0) < 0.5 ? uv.x : 1.0 - uv.x;
  float edge = t * 1.25 - 0.12 + (noise(vec2(uv.y * 60.0, row * 7.0)) - 0.5) * 0.1;
  float m = 1.0 - smoothstep(edge - 0.006, edge, x);
  vec3 a = texture(u_outgoing, uv).rgb;
  vec3 b = texture(u_incoming, uv).rgb;
  float heat = max(sin(3.14159265 * p), 0.0);
  float streak = noise(vec2(uv.x * 3.0, uv.y * 160.0));
  float dry = smoothstep(edge - 0.18, edge, x) * m * heat;
  vec3 col = mix(a, b * (1.0 - 0.35 * dry * streak), m);
  col *= 1.0 - 0.8 * exp(-abs(x - edge) * 140.0) * heat;
  fragColor = vec4(col, 1.0);
}
