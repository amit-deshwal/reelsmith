#version 300 es
precision highp float;
// Lens distortion with spectral edges: barrel (+) or pincushion (-) warp plus a radial red/blue fringe that grows toward the edges.
uniform sampler2D u_input;
uniform float u_distortion;
uniform float u_aberration;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
vec2 warp(vec2 uv, float k) {
  vec2 p = (uv - 0.5) * 2.0;
  float r2 = dot(p * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0), p * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0));
  p *= 1.0 + k * r2;
  p /= 1.0 + max(u_distortion, 0.0) * 1.2;   // keep the frame filled when it barrels
  return p * 0.5 + 0.5;
}
void main() {
  float k = u_distortion;
  vec2 uvR = warp(v_texCoord, k * (1.0 + u_aberration));
  vec2 uvG = warp(v_texCoord, k);
  vec2 uvB = warp(v_texCoord, k * (1.0 - u_aberration));
  vec3 c = vec3(texture(u_input, clamp(uvR, 0.0, 1.0)).r, texture(u_input, clamp(uvG, 0.0, 1.0)).g, texture(u_input, clamp(uvB, 0.0, 1.0)).b);
  fragColor = vec4(c, 1.0);
}
