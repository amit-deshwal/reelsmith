#version 300 es
precision highp float;

// Tile pop (Reels). The next shot pops open as a mosaic of rounded windows that grow from the middle outward, each window a
// piece of the incoming picture. At progress 1 every window is full, so the incoming picture is exact.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_cols;
uniform float u_round;

in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float cols = u_cols;
  float rows = max(1.0, floor(cols / u_aspect + 0.5));
  vec2 grid = vec2(cols, rows);
  vec2 g = v_texCoord * grid;
  vec2 cell = floor(g);
  vec2 lc = fract(g) - 0.5;
  float fromCentre = length((cell + 0.5) / grid - 0.5);
  float delay = clamp(fromCentre * 0.9 + hash(cell) * 0.25, 0.0, 0.9);
  float t = clamp((u_progress - delay * 0.6) / 0.4, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec2 q = abs(lc) * 2.0;
  float box = max(q.x, q.y);
  float round_ = length(q) * 0.7071;
  float dist = mix(box, round_, u_round * (1.0 - t));
  bool open = t >= 1.0 || dist <= t;
  vec3 a = texture(u_outgoing, v_texCoord).rgb * (1.0 - 0.12 * smoothstep(0.0, 1.0, u_progress) * (1.0 - u_progress));
  vec3 b = texture(u_incoming, v_texCoord).rgb;
  fragColor = vec4(open ? b : a, 1.0);
}
