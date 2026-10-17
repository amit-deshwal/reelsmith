#version 300 es
precision highp float;
// Swirl: twists the picture around a point; the twist fades to nothing at the radius.
uniform sampler2D u_input;
uniform float u_angle;
uniform float u_radius;
uniform float u_centerX;
uniform float u_centerY;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 c = vec2(u_centerX, u_centerY);
  vec2 d = (v_texCoord - c) * vec2(aspect, 1.0);
  float r = length(d);
  float k = smoothstep(u_radius, 0.0, r);
  float a = u_angle * k * k;
  float s = sin(a), co = cos(a);
  d = vec2(co * d.x - s * d.y, s * d.x + co * d.y);
  vec2 uv = d / vec2(aspect, 1.0) + c;
  fragColor = vec4(texture(u_input, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}
