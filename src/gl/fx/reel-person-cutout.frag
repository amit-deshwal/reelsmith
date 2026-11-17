#version 300 es
precision highp float;
// Person cut-out: only the person shows (everything else is transparent, so lower tracks show through), optionally
// flashed to solid white. Premultiplied-alpha out.
// RS-1273: the segmenter's matte is a few hundred pixels across; stretched to 1080x1920 its edge was a stair-step through
// the hair. The matte is now upsampled guided by the picture (a joint bilateral filter): each output pixel averages the
// nearby matte samples whose colour in the frame is like its own, so the edge follows the hair instead of the matte's grid.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_edge;   // edge softness
uniform float u_white;  // 0 the person as filmed, 1 a solid white silhouette
in vec2 v_texCoord;
out vec4 fragColor;

const float COLOR_SIGMA = 0.1;

void main() {
  vec3 c0 = texture(u_input, v_texCoord).rgb;
  vec2 cell = 1.0 / vec2(textureSize(u_mask, 0));
  float sum = 0.0;
  float wsum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 uv = v_texCoord + vec2(float(x), float(y)) * cell * 0.8;
      vec3 d = texture(u_input, uv).rgb - c0;
      float w = exp(-dot(d, d) / (2.0 * COLOR_SIGMA * COLOR_SIGMA)) * exp(-float(x * x + y * y) / 4.5);
      sum += texture(u_mask, uv).r * w;
      wsum += w;
    }
  }
  float m = sum / max(wsum, 1e-5);
  m = smoothstep(0.5 - u_edge, 0.5 + u_edge, m);
  vec3 c = mix(c0, vec3(1.0), clamp(u_white, 0.0, 1.0));
  fragColor = vec4(c * m, m);
}
