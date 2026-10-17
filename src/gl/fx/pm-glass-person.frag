#version 300 es
precision highp float;
// Glass person: the person turns to liquid glass. Inside the silhouette you see the background from beside them, refracted and
// split into colour fringes, with a bright rim and drifting highlights.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform vec2 u_subjectSize;
uniform float u_refract;
uniform float u_fringe;
uniform float u_rim;
uniform float u_tint;
in vec2 v_texCoord;
out vec4 fragColor;
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
float blurred(vec2 uv, float r, float aspect) {
  float s = maskAt(uv);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    s += maskAt(uv + vec2(cos(a) / aspect, sin(a)) * r);
  }
  return s / 13.0;
}
vec3 behind(vec2 uv, vec2 warp) {
  // the background just beside the person: whichever side is clearer of them
  float reach = max(u_subjectSize.x, 0.15) * 0.62 + 0.04;
  vec2 a = uv + vec2(reach, 0.0) + warp, b = uv - vec2(reach, 0.0) + warp;
  float wa = maskAt(a), wb = maskAt(b);
  return texture(u_input, clamp(wa < wb ? a : b, 0.0, 1.0)).rgb;
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  float eps = 0.012;
  float bx = blurred(uv + vec2(eps / aspect, 0.0), 0.02, aspect) - blurred(uv - vec2(eps / aspect, 0.0), 0.02, aspect);
  float by = blurred(uv + vec2(0.0, eps), 0.02, aspect) - blurred(uv - vec2(0.0, eps), 0.02, aspect);
  vec2 n = vec2(bx, by) * u_refract * 2.5;
  vec2 ripple = vec2(sin(uv.y * 20.0 + u_time * 1.6), cos(uv.x * 16.0 + u_time * 1.3)) * 0.004 * u_refract;
  vec2 warp = n + ripple;
  vec3 glass = vec3(behind(uv, warp * (1.0 + u_fringe)).r, behind(uv, warp).g, behind(uv, warp * (1.0 - u_fringe)).b);
  float soft = blurred(uv, 0.03, aspect);
  float rim = smoothstep(0.95, 0.35, soft) * m;
  float spec = pow(clamp(dot(normalize(vec2(bx, by) + 1e-5), normalize(vec2(0.6 + 0.4 * sin(u_time * 0.8), 0.8))), 0.0, 1.0), 6.0) * length(vec2(bx, by)) * 40.0;
  vec3 tint = vec3(0.82, 0.93, 1.0);
  glass = mix(glass, glass * tint, u_tint) + rim * u_rim * vec3(0.85, 0.95, 1.0) + spec * u_rim * 0.5;
  fragColor = vec4(clamp(mix(src, glass, m), 0.0, 1.0), 1.0);
}
