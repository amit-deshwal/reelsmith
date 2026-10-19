#version 300 es
precision highp float;

// Film burn (Reels). A warm burn blooms from a corner like film melting in the projector gate: a hot white core, an orange
// rim with ragged edges and overexposure around it; the cut happens under the brightest moment. Travel, memories, vintage.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_time;
uniform vec2 u_origin;     // where the burn starts, 0..1

in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 7.1) * 0.15; }

void main() {
  float p = u_progress;
  vec2 uv = v_texCoord;
  vec2 d = (uv - u_origin) * vec2(u_aspect, 1.0);
  float r = length(d);
  float f = fbm(uv * vec2(u_aspect, 1.0) * 3.0 + vec2(u_time * 0.25, -u_time * 0.15));
  float heat = max(sin(3.14159265 * p), 0.0);
  float front = p * 1.9 - r + (f - 0.5) * 0.7;
  vec3 a = texture(u_outgoing, uv).rgb;
  vec3 b = texture(u_incoming, uv).rgb;
  vec3 col = mix(a, b, smoothstep(0.42, 0.58, p));
  // the hot core is only the newest part of the burn: behind the front the picture shows through, warmed
  float core = smoothstep(-0.02, 0.12, front) * exp(-max(front, 0.0) * 3.5);
  float behind = smoothstep(0.0, 0.3, front);
  float rim = exp(-abs(front) * 9.0);
  col = mix(col, col * vec3(1.25, 0.95, 0.7) + vec3(0.12, 0.04, 0.0), behind * heat);
  col += vec3(1.0, 0.9, 0.7) * core * heat * 0.9;
  col += vec3(1.0, 0.4, 0.06) * rim * heat * 1.1;
  col = mix(col, vec3(1.0, 0.93, 0.82), heat * heat * heat * 0.45);
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}
