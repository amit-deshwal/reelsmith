#version 300 es
precision highp float;
// VHS tape: per-line wobble, colour bleed, a rolling tracking band, head-switching noise at the bottom and scanlines.
uniform sampler2D u_input;
uniform float u_time;
uniform float u_wobble;
uniform float u_bleed;
uniform float u_noise;
uniform float u_tracking;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float y = v_texCoord.y;
  float line = floor(y * 240.0);
  float t = floor(u_time * 30.0);
  float jitter = (hash(line + t * 13.0) - 0.5) * 0.004 * u_wobble;
  float band = fract(u_time * 0.12);                       // tracking band rolls up the picture
  float inBand = smoothstep(0.06, 0.0, abs(y - band)) * u_tracking;
  float shift = jitter + inBand * (0.03 + (hash(line + t) - 0.5) * 0.05);
  float bottom = smoothstep(0.06, 0.0, y);                 // head-switching noise
  shift += bottom * (hash(line + t * 3.0) - 0.5) * 0.08 * u_tracking;
  vec2 uv = vec2(clamp(v_texCoord.x + shift, 0.0, 1.0), y);
  float b = 0.004 * u_bleed;
  vec3 c = vec3(texture(u_input, clamp(uv + vec2(b, 0.0), 0.0, 1.0)).r, texture(u_input, uv).g, texture(u_input, clamp(uv - vec2(b, 0.0), 0.0, 1.0)).b);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(lum), c, 0.85);
  c *= 0.93 + 0.07 * sin(line * 3.14159);                    // scanlines
  c += (hash(line * 7.0 + v_texCoord.x * 91.0 + t) - 0.5) * 0.12 * u_noise * (0.4 + inBand + bottom * 2.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
