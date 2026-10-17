#version 300 es
precision highp float;

// Cube turn (Reels). The two shots are faces of a cube that turns about the cut: the face turning away shrinks and darkens, the
// face turning in grows, with the near edge taller than the far edges. At both ends one face fills the frame exactly.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_vertical;  // 0 = turns left/right, 1 = turns up/down
uniform float u_sign;      // +1 the next shot arrives from the right/bottom, -1 from the left/top
uniform float u_depth;     // how much taller the near edge is

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  float e = p * p * (3.0 - 2.0 * p);
  float theta = e * 1.5707963;
  vec2 q = u_vertical > 0.5 ? v_texCoord.yx : v_texCoord;      // q.x runs along the turn, q.y across it
  if (u_sign < 0.0) q.x = 1.0 - q.x;
  float seam = 1.0 - e;                                         // where the two faces meet along the turn
  vec3 col = vec3(0.0);
  if (q.x <= seam && seam > 0.0) {
    float s = q.x / seam;                                       // 0 far edge .. 1 at the seam
    float h = 1.0 - u_depth * sin(theta) * (1.0 - s);
    float y = 0.5 + (q.y - 0.5) / h;
    if (y >= 0.0 && y <= 1.0) {
      vec2 uv = vec2(s, y);
      if (u_sign < 0.0) uv.x = 1.0 - uv.x;
      uv = u_vertical > 0.5 ? uv.yx : uv;
      col = texture(u_outgoing, uv).rgb * (1.0 - 0.45 * sin(theta));
    }
  } else if (q.x > seam) {
    float s = (q.x - seam) / max(e, 1e-5);                     // 0 at the seam .. 1 far edge
    float h = 1.0 - u_depth * cos(theta) * s;
    float y = 0.5 + (q.y - 0.5) / h;
    if (y >= 0.0 && y <= 1.0) {
      vec2 uv = vec2(s, y);
      if (u_sign < 0.0) uv.x = 1.0 - uv.x;
      uv = u_vertical > 0.5 ? uv.yx : uv;
      col = texture(u_incoming, uv).rgb * (1.0 - 0.45 * cos(theta));
    }
  }
  fragColor = vec4(col, 1.0);
}
