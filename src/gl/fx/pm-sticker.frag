#version 300 es
precision highp float;
// Sticker cut-out: the person as a glossy die-cut sticker (thick white border, soft shadow, a shine across the border) on a
// soft, tinted, blurred copy of the scene.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_border;
uniform float u_bgBlur;
uniform float u_bgTint;
uniform vec3 u_tintColor;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
float dilate(vec2 uv, float r, float aspect) {
  float m = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 o = vec2(cos(a) / aspect, sin(a)) * r;
    m = max(m, maskAt(uv + o));
    m = max(m, maskAt(uv + o * 0.5));
  }
  return m;
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  vec3 bg = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 o = vec2(cos(a) / aspect, sin(a)) * u_bgBlur;
    bg += texture(u_input, clamp(uv + o, 0.0, 1.0)).rgb + texture(u_input, clamp(uv + o * 0.45, 0.0, 1.0)).rgb;
  }
  bg /= 24.0;
  float bl = dot(bg, vec3(0.299, 0.587, 0.114));
  bg = mix(bg, mix(u_tintColor, u_tintColor * (0.6 + 0.6 * bl), 0.6), u_bgTint);
  float sc = u_resolution.x / 1080.0;
  vec2 g = fract(uv * u_resolution / (16.0 * sc)) - 0.5;
  bg *= 1.0 - 0.06 * smoothstep(0.3, 0.2, length(g));                 // faint dot print
  float ring = dilate(uv, u_border, aspect);
  float shadow = dilate(uv - vec2(0.004 / aspect, -0.012), u_border * 1.2, aspect);
  vec3 col = bg * (1.0 - 0.38 * smoothstep(0.15, 0.95, shadow));
  float edgeBand = clamp(ring - m, 0.0, 1.0);
  float shine = smoothstep(0.0, 0.4, abs(fract((uv.x * aspect + uv.y) * 1.6 - u_time * 0.25) - 0.5) * 2.0 - 0.7) * 0.0;
  float gloss = 0.5 + 0.5 * sin((uv.x * aspect + uv.y) * 9.0 - u_time * 1.5);
  vec3 paper = vec3(0.99, 0.985, 0.97) * (0.96 + 0.04 * gloss);
  col = mix(col, paper, smoothstep(0.35, 0.7, ring));
  col = mix(col, src, m);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
