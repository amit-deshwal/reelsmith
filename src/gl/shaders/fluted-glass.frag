#version 300 es
precision highp float;

// Fluted glass (Reels). The frame is viewed through ribbed glass: the ribs refract harder and harder, each flips from the old
// shot to the new at its own moment, and the glass clears. Refraction is 0 at both ends.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_ribs;
uniform float u_refract;
uniform float u_split;     // colour fringe

in vec2 v_texCoord;
out vec4 fragColor;

float hash(float n) { return fract(sin(n * 78.233) * 43758.5453); }

void main() {
  float p = u_progress;
  float x = v_texCoord.x * u_ribs;
  float i = floor(x);
  float f = fract(x) - 0.5;                       // -0.5..0.5 across one rib
  float arc = sin(3.14159265 * p);
  float amp = u_refract * arc;
  float lens = f * 2.0;                            // rib acts as a cylinder lens
  float dx = -lens * amp / u_ribs;
  float dy = (hash(i) - 0.5) * 0.1 * arc * arc;   // ribs slide a little at different heights
  float thr = 0.35 + 0.3 * hash(i + 11.0);
  float showIn = step(thr, p);
  vec3 col;
  for (int c = 0; c < 3; c++) {
    float k = (float(c) - 1.0) * u_split * amp / u_ribs;
    vec2 uv = clamp(v_texCoord + vec2(dx + k, dy), 0.0, 1.0);
    vec3 s = showIn > 0.5 ? texture(u_incoming, uv).rgb : texture(u_outgoing, uv).rgb;
    col[c] = s[c];
  }
  float edge = smoothstep(0.42, 0.5, abs(f));
  col *= 1.0 - 0.25 * arc * edge;                  // dark seam between ribs
  col += 0.05 * arc * smoothstep(0.12, 0.0, abs(f + 0.3));  // soft highlight
  fragColor = vec4(col, 1.0);
}
