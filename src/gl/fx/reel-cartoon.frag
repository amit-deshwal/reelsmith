#version 300 es
precision highp float;
// Cartoon ink: flat colour bands plus dark outlines from a Sobel edge pass on the brightness.
uniform sampler2D u_input;
uniform float u_levels;
uniform float u_edge;
uniform float u_lineWidth;
uniform float u_saturation;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
float luma(vec2 uv) { return dot(texture(u_input, clamp(uv, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 px = u_lineWidth / max(u_resolution, vec2(1.0));
  float tl = luma(v_texCoord + vec2(-px.x, px.y)), t = luma(v_texCoord + vec2(0.0, px.y)), tr = luma(v_texCoord + px);
  float l = luma(v_texCoord + vec2(-px.x, 0.0)), r = luma(v_texCoord + vec2(px.x, 0.0));
  float bl = luma(v_texCoord - px), b = luma(v_texCoord + vec2(0.0, -px.y)), br = luma(v_texCoord + vec2(px.x, -px.y));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
  float edge = smoothstep(0.3, 0.8, length(vec2(gx, gy)) * u_edge);
  vec3 c = texture(u_input, v_texCoord).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, u_saturation);
  c = floor(c * u_levels + 0.5) / u_levels;
  fragColor = vec4(mix(c, vec3(0.03, 0.02, 0.04), edge), 1.0);
}
