#version 300 es
precision highp float;

// Window grow-in (RS-410). The incoming shot shows inside a centred rounded rectangle that grows from a small
// window to the whole frame; the outgoing shot stays behind it. Until 80% of the transition the window stays
// within u_limit (half-sizes, canvas fractions) so it clears Instagram's safe zone; it then opens to full frame.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform vec2 u_center;   // canvas fraction
uniform float u_start;   // start half-size as a share of u_limit, 0..1
uniform vec2 u_limit;    // half width and half height reached at 80%
uniform float u_radius;  // corner radius, canvas height fraction
uniform float u_shadow;  // 0..1 soft shadow strength
uniform float u_aspect;  // width / height

in vec2 v_texCoord;
out vec4 fragColor;

float ease(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

void main() {
  vec2 uv = v_texCoord;
  vec4 a = texture(u_outgoing, uv);
  vec4 b = texture(u_incoming, uv);
  float p = clamp(u_progress, 0.0, 1.0);
  vec2 full = vec2(max(u_center.x, 1.0 - u_center.x), max(u_center.y, 1.0 - u_center.y)) + vec2(0.05);
  float q = ease(p / 0.8);
  float r = ease((p - 0.8) / 0.2);
  vec2 half1 = mix(u_limit * u_start, u_limit, q);
  vec2 h = mix(half1, full, r);
  float rad = u_radius * (1.0 - r);
  // signed distance to the rounded rectangle, measured in height units so corners stay round
  vec2 d = (abs(uv - u_center) - h) * vec2(u_aspect, 1.0) + vec2(rad);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
  float inside = sd <= 0.0 ? 1.0 : 0.0;
  float sh = u_shadow * (1.0 - r) * (1.0 - smoothstep(0.0, 0.06, max(sd, 0.0)));
  vec4 base = vec4(a.rgb * (1.0 - 0.45 * sh), a.a);
  fragColor = mix(base, b, inside);
}
