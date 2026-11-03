#version 300 es
precision highp float;
// Relight (RS-1260, after DaVinci's Relight): a soft light sweeps across the subject. The surface's direction at each
// pixel comes from the depth map's slope (u_depth, white = near), so the side of a face or a shoulder turned toward the
// light brightens and the side turned away falls into soft shade. Only the subject and what is nearer get the light
// (by depth, around u_subject); the far land and the sky stay as they were. The light comes on at `at` seconds into the
// clip and sweeps from one angle to the other over `sweep` seconds (on the drop, when the director times it). Without a
// depth map the shot is unchanged.
uniform sampler2D u_input;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_hasDepth;
uniform float u_subject;
uniform float u_strength;
uniform float u_from;
uniform float u_to;
uniform float u_at;
uniform float u_sweep;
uniform float u_warmth;
in vec2 v_texCoord;
out vec4 fragColor;

float depthSoft(vec2 uv, vec2 o) {
  return (texture(u_depth, uv).r * 2.0 + texture(u_depth, uv + vec2(o.x, 0.0)).r + texture(u_depth, uv - vec2(o.x, 0.0)).r
    + texture(u_depth, uv + vec2(0.0, o.y)).r + texture(u_depth, uv - vec2(0.0, o.y)).r) / 6.0;
}

void main() {
  vec4 base = texture(u_input, v_texCoord);
  if (u_hasDepth < 0.5 || u_strength <= 0.0) { fragColor = base; return; }
  float k = clamp((u_time - u_at) / max(0.05, u_sweep), 0.0, 1.0);
  float on = smoothstep(u_at - 0.1, u_at + 0.25 * max(0.05, u_sweep), u_time);
  if (on <= 0.0) { fragColor = base; return; }
  float ang = radians(mix(u_from, u_to, k * k * (3.0 - 2.0 * k)));
  // slope over about 1% of the frame height, from a softened map (the model's depth is smooth inside a face)
  vec2 o = vec2(0.012 * u_resolution.y) / u_resolution;
  vec2 s = o * 0.5;
  float dx = depthSoft(v_texCoord + vec2(o.x, 0.0), s) - depthSoft(v_texCoord - vec2(o.x, 0.0), s);
  float dy = depthSoft(v_texCoord + vec2(0.0, o.y), s) - depthSoft(v_texCoord - vec2(0.0, o.y), s);
  // nearer = toward the camera; a surface rising toward +x faces -x
  vec3 n = normalize(vec3(-dx * 24.0, -dy * 24.0, 1.0));
  vec3 l = normalize(vec3(cos(ang), sin(ang), 0.55));
  // the light also falls off across the subject: the side of the frame it comes from brighter (a face's depth is nearly
  // flat inside, so the slope alone shades only its edges)
  vec2 pos = (v_texCoord - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float across = clamp(dot(pos, vec2(cos(ang), sin(ang))) / 0.3, -1.0, 1.0);
  float lambert = max(dot(n, l), 0.0);
  float flatLit = l.z;
  float d = texture(u_depth, v_texCoord).r;
  float nearW = smoothstep(u_subject - 0.22, u_subject - 0.06, d);
  float amt = u_strength * on * nearW;
  vec3 lightCol = mix(vec3(1.0), vec3(1.0, 0.86, 0.68), clamp(u_warmth, 0.0, 1.0));
  // the lit side up to about 1.5x, the shaded side down to about 0.7x, a flat surface facing the camera about as it was
  float key = (lambert - flatLit) * 1.1 + across * 0.28;
  float gain = 1.0 + key;
  vec3 lit = base.rgb * mix(vec3(1.0), lightCol, clamp(key * 2.0, 0.0, 1.0)) * clamp(gain, 0.65, 1.6);
  fragColor = vec4(mix(base.rgb, min(lit, vec3(1.0)), clamp(amt, 0.0, 1.0)), base.a);
}
