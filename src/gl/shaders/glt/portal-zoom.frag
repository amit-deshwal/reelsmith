#version 300 es
precision highp float;
precision highp int;

// Portal zoom (Reels). A round portal with a light rim pops open in the middle of the shot showing the next one inside,
// then the camera flies through it: the shot zooms (blurring) around the portal, the portal grows past the frame and the
// next shot settles to full size. Entering a place, a reveal. Adapted from GTKottman/remotion-transitions "portal-zoom" (MIT).
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

const vec2 CENTER = vec2(0.5, 0.5);   // fraction of width, height (y down)
const float RADIUS = 0.14;            // of the frame height
const vec3 RING = vec3(0.945, 0.937, 0.918);
const int TAPS = 8;

float seg(float p, float a, float b) { return clamp((p - a) / (b - a), 0.0, 1.0); }
float inCubic(float t) { return t * t * t; }
float outBack(float t) { return 1.0 + 2.70158 * pow(t - 1.0, 3.0) + 1.70158 * pow(t - 1.0, 2.0); }
vec2 toUv(vec2 p) { return vec2(p.x / u_aspect, 1.0 - p.y); }

void main() {
  float pr = u_progress;
  vec2 p = vec2(v_texCoord.x * u_aspect, 1.0 - v_texCoord.y);
  vec2 c = CENTER * vec2(u_aspect, 1.0);
  float far = max(max(length(c), length(vec2(u_aspect, 0.0) - c)), max(length(vec2(0.0, 1.0) - c), length(vec2(u_aspect, 1.0) - c)));
  float open = outBack(seg(pr, 0.0, 0.3));
  float qs = seg(pr, 0.3, 1.0);
  float q = inCubic(qs);
  float Z = mix(1.0, far * 1.08 / RADIUS, q);
  float r = RADIUS * max(0.0, open) * Z;
  float d = length(p - c);
  if (pr >= 1.0) { fragColor = vec4(texture(u_incoming, v_texCoord).rgb, 1.0); return; }

  // the outgoing shot, zoomed by Z around the portal with a zoom blur that follows the speed of the fly-in
  float blur = 0.35 * qs * qs;
  vec3 a = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float z = Z * (1.0 + blur * float(i) / float(TAPS));
    a += texture(u_outgoing, toUv(c + (p - c) / z)).rgb;
  }
  a /= float(TAPS);
  if (r <= 0.0) { fragColor = vec4(a, 1.0); return; }

  vec3 b = texture(u_incoming, toUv(c + (p - c) / mix(0.55, 1.0, q))).rgb;
  float rim = max(0.0, 14.0 / 1080.0 * Z * (1.0 - q));
  float aa = 1.5 / 1080.0;
  float inside = 1.0 - smoothstep(r - aa, r, d);
  float ring = smoothstep(r - rim - aa, r - rim, d) * step(0.0005, rim);
  vec3 portal = mix(b, RING, ring);
  float shade = 0.35 * exp(-max(d - r, 0.0) / max(rim * 1.5, 0.001)) * step(0.0005, rim);
  fragColor = vec4(mix(a * (1.0 - shade), portal, inside), 1.0);
}
