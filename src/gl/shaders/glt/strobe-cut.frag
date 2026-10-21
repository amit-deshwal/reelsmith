#version 300 es
precision highp float;
precision highp int;

// Strobe cut (Reels). The two shots flicker back and forth with the swaps coming faster and faster (square-root
// spacing), each swap landing with a flash and a small zoom punch, and it ends on the next shot. Build-ups, a drop, hype.
// Adapted from GTKottman/remotion-transitions "strobe-cut" (MIT), with the flash and punch added.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const float SWAPS = 7.0;   // odd, so it ends on the next shot

void main() {
  float pr = u_progress;
  float k = 0.0, last = 0.0;
  for (int i = 1; i <= int(SWAPS); i++) {
    float at = sqrt(float(i) / (SWAPS + 1.0));
    if (pr >= at) { k = float(i); last = at; }
  }
  bool showB = mod(k, 2.0) > 0.5;
  float since = pr - last;
  float hit = k > 0.0 ? exp(-since * 45.0) * (1.0 - smoothstep(0.96, 1.0, pr)) : 0.0;
  vec2 uv = (v_texCoord - 0.5) / (1.0 + 0.04 * hit) + 0.5;
  vec3 col = showB ? texture(u_incoming, uv).rgb : texture(u_outgoing, uv).rgb;
  col = mix(col, vec3(1.0), 0.45 * hit);
  fragColor = vec4(col, 1.0);
}
