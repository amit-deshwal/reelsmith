#version 300 es
precision highp float;

// 3D spin (Reels). The shot is a card that spins away in perspective, edge-on at the middle, and the next shot spins in on
// its back, with shading as it turns. Sideways or (u_vertical) top over bottom. Sports, fitness, a snare fill.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_vertical;  // 1 = turn around the horizontal axis
uniform float u_sign;      // spin direction

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  float e = p * p * (3.0 - 2.0 * p);
  float ang = 3.14159265 * e;
  bool first = ang < 1.5707963;
  float a = (first ? ang : ang - 3.14159265) * u_sign;
  vec2 q = (v_texCoord - 0.5) * vec2(u_aspect, 1.0);
  if (u_vertical > 0.5) q = q.yx;
  float span = u_vertical > 0.5 ? 1.0 : u_aspect;
  float D = 2.4 * max(span, 1.0);
  float c = cos(a), s = sin(a);
  float denom = D * c - q.x * s;
  if (denom <= 0.0001) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float x = q.x * D / denom;
  float z = x * s;
  float y = q.y * (D + z) / D;
  vec2 cq = vec2(x, y);
  if (u_vertical > 0.5) cq = cq.yx;
  vec2 uv = cq / vec2(u_aspect, 1.0) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 col = first ? texture(u_outgoing, uv).rgb : texture(u_incoming, uv).rgb;
  col *= 1.0 - 0.45 * abs(s);
  fragColor = vec4(col, 1.0);
}
