#version 300 es
precision highp float;
// Bounce: the picture punches in and stretches a little, then settles. Give it timing "beat" so it bounces on every beat;
// the envelope scales the punch, so between beats the picture is untouched.
uniform sampler2D u_input;
uniform float u_amount;        // zoom at the top of the bounce
uniform float u_stretch;       // vertical stretch as a share of the zoom
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  vec2 c = v_texCoord - 0.5;
  vec2 s = vec2(1.0 + u_amount, 1.0 + u_amount * (1.0 + u_stretch));
  fragColor = texture(u_input, clamp(c / s + 0.5, 0.0, 1.0));
}
