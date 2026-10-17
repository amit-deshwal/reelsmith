#version 300 es
precision highp float;

// Ripple dissolve (Reels). A ring expands from the centre: inside it the next shot, with a water-like ripple at the front that
// bends both pictures. Ripple strength is 0 at both ends and the ring clears the corners by progress 1.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;
uniform vec2 u_center;
uniform float u_amp;
uniform float u_freq;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  float p = u_progress;
  float e = p * p * (3.0 - 2.0 * p);
  vec2 d2 = (v_texCoord - u_center) * vec2(u_aspect, 1.0);
  float d = length(d2);
  vec2 dir = d > 1e-5 ? d2 / d : vec2(0.0);
  vec2 far = max(u_center, 1.0 - u_center) * vec2(u_aspect, 1.0);
  float r = e * (length(far) + 0.12);              // the ring always clears the farthest corner at progress 1
  float arc = sin(3.14159265 * p);
  float w = sin((d - r) * u_freq) * exp(-abs(d - r) * 5.0);
  vec2 off = dir / vec2(u_aspect, 1.0) * w * u_amp * arc;
  vec2 uv = clamp(v_texCoord + off, 0.0, 1.0);
  float m = smoothstep(r + 0.06, r - 0.06, d);   // 1 inside the ring
  vec3 a = texture(u_outgoing, uv).rgb;
  vec3 b = texture(u_incoming, uv).rgb;
  vec3 col = mix(a, b, m);
  col += 0.12 * arc * max(w, 0.0);                // crest catches the light
  fragColor = vec4(col, 1.0);
}
