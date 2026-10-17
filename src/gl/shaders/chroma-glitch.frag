#version 300 es
precision highp float;

// Chromatic glitch (Reels). The picture tears into bands that jump sideways, split into red/green/blue and swap to the next
// shot band by band, stepping at about 15 changes a second. Everything is 0 at both ends.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_intensity;
uniform float u_bands;

in vec2 v_texCoord;
out vec4 fragColor;

float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

void main() {
  float p = u_progress;
  float step_ = floor(p * 15.0);
  float chaos = u_intensity * pow(max(sin(3.14159265 * p), 0.0), 0.7);
  float band = floor(v_texCoord.y * u_bands);
  float h = hash(band + step_ * 17.0);
  float h2 = hash(band * 1.7 + 5.0);
  float jump = step(0.5, hash(band * 3.1 + step_ * 7.0)) * (h - 0.5) * 0.3 * chaos;
  float split = chaos * 0.03 * (0.4 + h);
  float swap = smoothstep(0.3, 0.7, p);
  float showIn = step(h2, swap);                 // each band changes shot at its own moment
  float scan = 1.0 - 0.12 * chaos * step(0.5, fract(v_texCoord.y * 240.0));
  vec3 col;
  for (int c = 0; c < 3; c++) {
    float off = (float(c) - 1.0) * split;
    vec2 uv = vec2(clamp(v_texCoord.x + jump + off, 0.0, 1.0), v_texCoord.y);
    vec3 s = showIn > 0.5 ? texture(u_incoming, uv).rgb : texture(u_outgoing, uv).rgb;
    col[c] = s[c];
  }
  fragColor = vec4(col * scan, 1.0);
}
