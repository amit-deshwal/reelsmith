#version 300 es
precision highp float;
// Subject pop: the person stays in vivid colour with a glowing rim while the background goes dark, desaturated and soft.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_bgSat;
uniform float u_bgDim;
uniform float u_bgBlur;
uniform float u_glow;
uniform float u_rim;
uniform vec3 u_rimColor;
in vec2 v_texCoord;
out vec4 fragColor;
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  // soft background
  vec3 bg = vec3(0.0);
  float w = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 o = vec2(cos(a) / aspect, sin(a)) * u_bgBlur;
    bg += texture(u_input, clamp(uv + o, 0.0, 1.0)).rgb + texture(u_input, clamp(uv + o * 0.5, 0.0, 1.0)).rgb;
    w += 2.0;
  }
  bg /= w;
  float bl = dot(bg, vec3(0.299, 0.587, 0.114));
  bg = mix(vec3(bl), bg, u_bgSat) * u_bgDim;
  // rim and aura from the matte
  float ring = 0.0, aura = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a) / aspect, sin(a));
    ring = max(ring, maskAt(uv + d * 0.006));
    aura += maskAt(uv + d * 0.02) + maskAt(uv + d * 0.045);
  }
  aura /= 24.0;
  float rim = clamp(ring - m, 0.0, 1.0) * u_rim;
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  vec3 subject = clamp(mix(vec3(l), src, 1.25) * 1.04, 0.0, 1.0);
  vec3 col = mix(bg, subject, m);
  col += u_rimColor * (rim + (1.0 - m) * aura * u_glow * 0.55);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
