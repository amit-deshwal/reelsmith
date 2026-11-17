#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_intensity;
uniform float u_contrast;
// Reelsmith RS-1273: 0 the full grade (upstream); 1 keeps reds, skin and strong colours as filmed, under the graded light
uniform float u_keep;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_input, v_texCoord);
  vec3 g = (c.rgb - 0.5) * u_contrast + 0.5;
  float lum = dot(g, vec3(0.299, 0.587, 0.114));
  // push shadows teal, highlights orange
  vec3 teal = vec3(0.15, 0.45, 0.55);
  vec3 orange = vec3(0.95, 0.55, 0.25);
  vec3 grade = mix(teal * lum * 1.4, orange * (0.4 + lum * 0.9), smoothstep(0.25, 0.75, lum));
  // keep some original chroma
  vec3 mixed = mix(g, mix(g * 0.55 + grade * 0.45, grade, 0.35), 1.0);
  vec3 graded = clamp(mixed, 0.0, 1.0);
  // the filmed colour on the graded brightness, kept where the colour is strong or warm (a red car, skin)
  vec3 w = vec3(0.299, 0.587, 0.114);
  vec3 kept = clamp(g - dot(g, w) + dot(graded, w), 0.0, 1.0);
  float sat = max(g.r, max(g.g, g.b)) - min(g.r, min(g.g, g.b));
  float warm = smoothstep(0.02, 0.2, g.r - max(g.g, g.b));
  float protect = clamp(u_keep, 0.0, 1.0) * clamp(0.35 + 0.65 * max(smoothstep(0.1, 0.35, sat), warm), 0.0, 1.0);
  graded = mix(graded, kept, protect);
  fragColor = vec4(mix(c.rgb, graded, u_intensity), c.a);
}
