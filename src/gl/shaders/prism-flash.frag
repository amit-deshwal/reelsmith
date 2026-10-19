#version 300 es
precision highp float;

// Prism flash (Reels). A bright diagonal band of light sweeps across, splitting into rainbow fringes like light through a
// prism; the next shot is behind the band. Fashion, nights out, a polished product-style cut.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_angle;     // direction the band travels, radians

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  vec2 uv = v_texCoord;
  vec2 dir = vec2(cos(u_angle), sin(u_angle));
  float span = 0.5 * (abs(dir.x) * u_aspect + abs(dir.y));
  float coord = dot((uv - 0.5) * vec2(u_aspect, 1.0), dir) / max(span, 0.01);  // -1 .. 1 across the frame
  float pos = mix(-1.35, 1.35, p);
  float dx = (coord - pos) * 4.0;
  float band = exp(-dx * dx);
  float heat = max(sin(3.14159265 * p), 0.0);
  vec2 off = dir / vec2(u_aspect, 1.0) * 0.025 * band * heat;
  bool next = coord < pos;
  vec3 col = next
    ? vec3(texture(u_incoming, uv + off).r, texture(u_incoming, uv).g, texture(u_incoming, uv - off).b)
    : vec3(texture(u_outgoing, uv + off).r, texture(u_outgoing, uv).g, texture(u_outgoing, uv - off).b);
  vec3 rainbow = 0.5 + 0.5 * cos(6.2831853 * ((coord - pos) * 1.6 + vec3(0.0, 0.33, 0.67)));
  float fringe = exp(-dx * dx * 0.25);
  col += (vec3(1.0) * band * 0.85 + rainbow * fringe * 0.35) * heat;
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
