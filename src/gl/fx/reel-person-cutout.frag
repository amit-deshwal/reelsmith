#version 300 es
precision highp float;
// Person cut-out: only the person shows (everything else is transparent, so lower tracks show through), optionally
// flashed to solid white. Premultiplied-alpha out.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_edge;   // edge softness
uniform float u_white;  // 0 the person as filmed, 1 a solid white silhouette
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  float m = texture(u_mask, v_texCoord).r;
  m = smoothstep(0.5 - u_edge, 0.5 + u_edge, m);
  vec3 c = mix(texture(u_input, v_texCoord).rgb, vec3(1.0), clamp(u_white, 0.0, 1.0));
  fragColor = vec4(c * m, m);
}
