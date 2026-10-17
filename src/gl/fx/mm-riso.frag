#version 300 es
precision highp float;
// Risograph print: two spot-colour inks printed as halftone dots on off-white paper, slightly out of register, with speckle and grain.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_dots;
uniform float u_misprint;
uniform float u_grain;
uniform vec3 u_inkA;
uniform vec3 u_inkB;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float halftone(vec2 p, float angle, float level, float size) {
  float s = sin(angle), c = cos(angle);
  vec2 r = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) / size;
  vec2 g = fract(r) - 0.5;
  float radius = sqrt(clamp(level, 0.0, 1.0)) * 0.72;
  return smoothstep(radius + 0.12, radius - 0.12, length(g));
}
void main() {
  float sc = u_resolution.x / 1080.0;
  vec2 p = v_texCoord * u_resolution / sc;
  float size = u_dots;
  vec2 shiftB = vec2(u_misprint, -u_misprint * 0.6) * sc;
  vec3 a = texture(u_input, v_texCoord).rgb;
  vec3 b = texture(u_input, clamp(v_texCoord + shiftB / u_resolution, 0.0, 1.0)).rgb;
  float la = 1.0 - dot(a, vec3(0.299, 0.587, 0.114));
  float lb = 1.0 - dot(b, vec3(0.299, 0.587, 0.114));
  float inkA = halftone(p, 0.26, smoothstep(0.1, 0.9, la), size);
  float inkB = halftone(p + shiftB, 1.31, smoothstep(0.35, 1.0, lb * lb * 1.4), size);
  vec3 paper = vec3(0.97, 0.95, 0.9) * (0.96 + 0.04 * hash(floor(p * 0.8)));
  vec3 col = paper * mix(vec3(1.0), u_inkA, inkA * 0.93) * mix(vec3(1.0), u_inkB, inkB * 0.93);
  float speck = step(0.985, hash(floor(p * 1.5) + 3.0)) * 0.25;
  col *= 1.0 - speck * u_grain;
  col += (hash(p + floor(u_time * 8.0)) - 0.5) * 0.05 * u_grain;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
