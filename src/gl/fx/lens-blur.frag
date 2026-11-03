#version 300 es
precision highp float;
// Lens blur (RS-1260): a background blur by depth, like iPhone Cinematic mode, with an optional focus pull. Each pixel's
// blur (its circle of confusion) grows with its depth's distance from the focus; the picture is gathered over a disc of
// golden-angle taps where a tap counts only if its own blur reaches this pixel, and a tap farther away than this pixel
// may not spread over it more than this pixel's own blur (Gustafsson's single-pass bokeh), so a sharp person keeps a
// clean edge against a soft valley and a blurred near branch still spreads over what is behind it. u_depth: this frame's
// depth (white = near; a video's depth track, a photo's still map); without one the shot is unchanged.
uniform sampler2D u_input;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_hasDepth;
// the depth of the shot's subject at this frame (0 far .. 1 near)
uniform float u_subject;
// -1: on the subject; else the depth in focus (0 the far view .. 1 the nearest)
uniform float u_focus;
// -1: no pull; else the depth the focus pulls to, from u_at seconds into the clip over u_pullTime seconds
uniform float u_pullTo;
uniform float u_at;
uniform float u_pullTime;
// the largest blur (radius, a share of the frame height) and the depth either side of the focus that stays sharp
uniform float u_blur;
uniform float u_range;
in vec2 v_texCoord;
out vec4 fragColor;

const int TAPS = 96;
const float GOLDEN = 2.39996323;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec4 base = texture(u_input, v_texCoord);
  if (u_hasDepth < 0.5 || u_blur <= 0.0) { fragColor = base; return; }
  float start = u_focus < 0.0 ? u_subject : u_focus;
  float focus = start;
  if (u_pullTo >= 0.0) {
    float k = clamp((u_time - u_at) / max(0.05, u_pullTime), 0.0, 1.0);
    focus = mix(start, u_pullTo, k * k * (3.0 - 2.0 * k));
  }
  float maxR = u_blur * u_resolution.y;
  vec2 px = 1.0 / u_resolution;
  float cd = texture(u_depth, v_texCoord).r;
  float cc = maxR * smoothstep(u_range, u_range + 0.3, abs(cd - focus));
  vec3 acc = base.rgb;
  float tot = 1.0;
  float spin = hash(floor(v_texCoord * u_resolution)) * 6.2831853;
  for (int i = 1; i <= TAPS; i++) {
    float r = sqrt(float(i) / float(TAPS)) * maxR;
    float a = float(i) * GOLDEN + spin;
    vec2 uv = clamp(v_texCoord + vec2(cos(a), sin(a)) * r * px, 0.0, 1.0);
    vec3 c = texture(u_input, uv).rgb;
    float d = texture(u_depth, uv).r;
    float sc = maxR * smoothstep(u_range, u_range + 0.3, abs(d - focus));
    if (d < cd) sc = min(sc, cc * 2.0);
    float m = smoothstep(r - 1.0, r + 1.0, sc);
    acc += mix(acc / tot, c, m);
    tot += 1.0;
  }
  fragColor = vec4(acc / tot, base.a);
}
