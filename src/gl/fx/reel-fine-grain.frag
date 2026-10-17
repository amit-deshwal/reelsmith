#version 300 es
precision highp float;
// Fine film grain: monochrome grain measured in real pixels (so it is the same on portrait and landscape), strongest in the
// midtones, changing at 24 fps. u_size is the grain size in pixels at 1080 wide.
uniform sampler2D u_input;
uniform float u_strength;
uniform float u_size;
uniform float u_time;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec4 c = texture(u_input, v_texCoord);
  float cell = max(u_size, 0.5) * u_resolution.x / 1080.0;
  vec2 g = floor(v_texCoord * u_resolution / cell);
  float frame = floor(u_time * 24.0);
  float n = hash(g + frame * 17.0) + hash(g * 1.7 + frame * 5.0 + 3.0) - 1.0;   // roughly gaussian, -1..1
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float mid = 1.0 - pow(abs(lum * 2.0 - 1.0), 2.0) * 0.7;
  fragColor = vec4(clamp(c.rgb + n * u_strength * mid, 0.0, 1.0), c.a);
}
