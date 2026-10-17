#version 300 es
precision highp float;

// Slide over (Reels). The next shot slides over the current one with an ease-out; the current shot drifts back, shrinks and
// dims, and the sliding edge casts a soft shadow. Clean and quick, the opposite of a flashy effect.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform vec2 u_dir;        // (1,0): the next shot enters from the right
uniform float u_parallax;  // how far the current shot drifts, share of the slide
uniform float u_shadow;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  float e = 1.0 - pow(1.0 - p, 3.0);
  vec2 inUv = v_texCoord - u_dir * (1.0 - e);
  bool covered = inUv.x >= 0.0 && inUv.x <= 1.0 && inUv.y >= 0.0 && inUv.y <= 1.0;
  if (covered) { fragColor = vec4(texture(u_incoming, inUv).rgb, 1.0); return; }
  float sc = 1.0 - 0.06 * e;
  vec2 outUv = (v_texCoord - 0.5) / sc + 0.5 + u_dir * e * u_parallax;
  vec3 a = texture(u_outgoing, clamp(outUv, 0.0, 1.0)).rgb;
  float dist = length(max(vec2(0.0), max(-inUv, inUv - 1.0)) * (abs(u_dir) + 0.0001));
  a *= 1.0 - 0.35 * e * (1.0 - p);
  a *= 1.0 - u_shadow * e * (1.0 - p) * exp(-dist * 9.0);
  fragColor = vec4(a, 1.0);
}
