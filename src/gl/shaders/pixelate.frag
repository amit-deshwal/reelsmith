#version 300 es
precision highp float;

// Pixel dissolve (Reels). The shot breaks into square pixels that grow to their coarsest in the middle, the pixels swap to
// the next shot one by one at that point, then they sharpen back into the picture. A "tech reveal" or a censored-joke cut.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform float u_blocks;    // pixels across the frame at the coarsest moment

in vec2 v_texCoord;
out vec4 fragColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  float p = u_progress;
  float k = 1.0 - abs(2.0 * p - 1.0);
  k = k * k * (3.0 - 2.0 * k);
  if (k < 0.002) { fragColor = p < 0.5 ? texture(u_outgoing, v_texCoord) : texture(u_incoming, v_texCoord); return; }
  float across = u_blocks * pow(1500.0 / u_blocks, 1.0 - k);
  vec2 cells = vec2(across, across / max(u_aspect, 0.01));
  vec2 cell = floor(v_texCoord * cells);
  vec2 uv = (cell + 0.5) / cells;
  float swap = smoothstep(0.38, 0.62, p + (hash(cell) - 0.5) * 0.24);
  fragColor = mix(texture(u_outgoing, uv), texture(u_incoming, uv), swap);
}
