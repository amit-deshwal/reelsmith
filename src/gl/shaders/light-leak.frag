#version 300 es
precision highp float;

// Light leak (Reels). A warm film bloom washes across the frame from one side; the cut happens under its peak. The bloom is
// screened over the picture and is 0 at both ends. Soft streaks and a little grain keep it from looking like a flat gradient.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform vec2 u_dir;        // side the light comes from: (1,0) from the right
uniform float u_intensity;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * noise(p) + 0.3 * noise(p * 2.1 + 3.7) + 0.2 * noise(p * 4.3 + 8.1); }

void main() {
  float p = u_progress;
  vec3 a = texture(u_outgoing, v_texCoord).rgb;
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  float m = smoothstep(0.4, 0.62, p);
  vec3 col = mix(a, b, m);

  float env = pow(max(sin(3.14159265 * p), 0.0), 1.3);
  vec2 along = u_dir;                                  // light travels against this direction
  float pos = dot(v_texCoord - 0.5, along) + 0.5;      // 0..1 across the sweep
  float front = 1.15 - 1.5 * p;                        // the bloom's core moves from the entry side across
  float dp = pos - front;
  float core = exp(-(dp * 2.4) * (dp * 2.4));
  float wide = exp(-(dp * 1.1) * (dp * 1.1));
  vec2 st = vec2(v_texCoord.x * u_aspect, v_texCoord.y);
  float streak = fbm(vec2(dot(st, vec2(-along.y, along.x)) * 3.0, p * 2.0));
  float leak = (0.55 * core + 0.4 * wide) * (0.45 + 0.9 * streak) * env * u_intensity;

  vec3 hot = vec3(1.0, 0.93, 0.78), mid = vec3(1.0, 0.45, 0.12), edge = vec3(0.9, 0.12, 0.35);
  vec3 tint = mix(edge, mid, smoothstep(0.0, 0.45, leak));
  tint = mix(tint, hot, smoothstep(0.45, 1.0, leak));
  vec3 glow = tint * min(leak, 0.9);
  col = 1.0 - (1.0 - col) * (1.0 - glow);   // screen: never past white, the picture stays readable
  col += (hash(v_texCoord * 900.0 + p) - 0.5) * 0.05 * env;   // grain
  fragColor = vec4(col, 1.0);
}
