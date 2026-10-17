#version 300 es
precision highp float;
// Echo copies: clones of the person step out one per beat into a row on both sides, spread wide, then snap back into them.
// Each clone is slightly smaller and tinted; the real person stays on top and sharp.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_subjectCenter;
uniform vec2 u_subjectSize;
uniform float u_copies;    // number of clones
uniform float u_beat;      // seconds per step
uniform float u_spread;    // distance between clones, in person widths
uniform float u_tint;
uniform float u_fade;
in vec2 v_texCoord;
out vec4 fragColor;
float maskAt(vec2 uv) { return texture(u_mask, clamp(uv, 0.0, 1.0)).r; }
vec3 tinted(vec3 c, float k) {
  vec3 pal = k < 1.0 ? vec3(0.4, 0.9, 1.0) : k < 2.0 ? vec3(1.0, 0.45, 0.8) : k < 3.0 ? vec3(1.0, 0.9, 0.35) : vec3(0.6, 1.0, 0.55);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, pal * (0.35 + 0.9 * l), u_tint);
}
void main() {
  vec2 uv = v_texCoord;
  vec3 src = texture(u_input, uv).rgb;
  float m = smoothstep(0.42, 0.58, maskAt(uv));
  float n = floor(u_copies + 0.5);
  float cycle = n + 3.0;
  float phase = mod(u_time / max(u_beat, 0.05), cycle);
  float visible = min(n, floor(phase));                    // one more clone per beat
  float collapse = phase > n + 1.0 ? smoothstep(0.0, 1.0, (phase - (n + 1.0)) / 2.0) : 0.0;   // then they snap back
  float spread = clamp(u_subjectSize.x, 0.12, 0.7) * u_spread * (1.0 - collapse);
  vec2 c = u_subjectCenter;
  vec3 col = src;
  for (int k = 8; k >= 1; k--) {                           // far clones first
    if (float(k) > n) continue;
    float fk = float(k);
    if (fk > visible) continue;
    float side = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float rank = floor((fk + 1.0) * 0.5);
    vec2 off = vec2(side * rank * spread, (mod(fk, 2.0) < 0.5 ? 0.012 : -0.012) * rank * (1.0 - collapse));
    float sc = 1.0 - 0.12 * rank;
    vec2 suv = c + (uv - c - off) / sc;
    float cm = smoothstep(0.42, 0.58, maskAt(suv)) * step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    vec3 cc = tinted(texture(u_input, clamp(suv, 0.0, 1.0)).rgb, mod(fk, 4.0));
    float alpha = cm * mix(1.0, 0.95 - 0.1 * rank, u_fade) * (1.0 - collapse * 0.6);
    col = mix(col, cc, alpha);
  }
  col = mix(col, src, m);
  fragColor = vec4(col, 1.0);
}
