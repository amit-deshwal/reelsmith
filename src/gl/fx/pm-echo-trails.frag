#version 300 es
precision highp float;
// Echo trails (Echo Print): the person leaves tinted afterimages of where they were a moment ago, so every move smears into a
// trail of colour prints. The renderer hands in the clip as it looked 1..4 steps ago (u_hist0..3) with the person matte of each.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform sampler2D u_hist0;
uniform sampler2D u_hist1;
uniform sampler2D u_hist2;
uniform sampler2D u_hist3;
uniform sampler2D u_histMask0;
uniform sampler2D u_histMask1;
uniform sampler2D u_histMask2;
uniform sampler2D u_histMask3;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform float u_trail;     // how many afterimages (1..4)
uniform float u_tint;
uniform float u_fade;
uniform float u_grow;      // older prints swell a little
uniform float u_dim;       // darken the scene so the prints read
in vec2 v_texCoord;
out vec4 fragColor;
float soft(float m) { return smoothstep(0.42, 0.58, m); }
vec3 tapColor(int k, vec2 uv) {
  if (k == 1) return texture(u_hist0, uv).rgb;
  if (k == 2) return texture(u_hist1, uv).rgb;
  if (k == 3) return texture(u_hist2, uv).rgb;
  return texture(u_hist3, uv).rgb;
}
float tapMask(int k, vec2 uv) {
  if (k == 1) return texture(u_histMask0, uv).r;
  if (k == 2) return texture(u_histMask1, uv).r;
  if (k == 3) return texture(u_histMask2, uv).r;
  return texture(u_histMask3, uv).r;
}
void main() {
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = soft(texture(u_mask, uv).r);
  vec3 col = src * (1.0 - u_dim);
  for (int k = 4; k >= 1; k--) {                      // oldest print first, so newer ones lie over it
    float fk = float(k);
    if (fk > u_trail + 0.01) continue;
    vec2 suv = u_subjectCenter + (uv - u_subjectCenter) / (1.0 + u_grow * 0.05 * fk);
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float cm = soft(tapMask(k, suv));
    vec3 pal = 0.55 + 0.45 * cos(6.2832 * (fk * 0.19 + vec3(0.0, 0.33, 0.67)));
    vec3 c = tapColor(k, suv);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, pal * (0.4 + 0.9 * l), u_tint);
    float a = cm * mix(0.9, 0.85 * (1.0 - (fk - 1.0) / 4.5), u_fade);
    col = mix(col, c, a);
  }
  col = mix(col, src, m);                             // the real person, sharp, on top
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
