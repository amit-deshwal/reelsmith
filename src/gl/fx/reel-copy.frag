#version 300 es
precision highp float;
// Pass-through: lets a multi-pass effect keep the original picture as its own pass to composite over later.
uniform sampler2D u_input;
in vec2 v_texCoord;
out vec4 fragColor;
void main() { fragColor = texture(u_input, v_texCoord); }
