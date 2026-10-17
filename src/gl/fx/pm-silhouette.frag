#version 300 es
precision highp float;
// Silhouette: the person as a flat colour on a colour background (optionally a gradient and a halftone texture): the graphic
// poster look, and a clear view of what the person matte sees.
uniform sampler2D u_input;
uniform sampler2D u_mask;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_edge;       // edge softness
uniform float u_texture;    // halftone texture in the background
uniform float u_keepDetail; // how much of the real picture shows through the silhouette
uniform vec3 u_subjectColor;
uniform vec3 u_backColor;
uniform vec3 u_backColor2;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  float m = texture(u_mask, v_texCoord).r;
  m = smoothstep(0.5 - u_edge, 0.5 + u_edge, m);
  vec3 src = texture(u_input, v_texCoord).rgb;
  vec3 back = mix(u_backColor, u_backColor2, v_texCoord.y);
  float sc = u_resolution.x / 1080.0;
  vec2 g = fract(v_texCoord * u_resolution / (14.0 * sc)) - 0.5;
  float dots = smoothstep(0.32, 0.22, length(g)) * (1.0 - v_texCoord.y);
  back = mix(back, back * 0.82, dots * u_texture);
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  vec3 subj = mix(u_subjectColor, u_subjectColor * (0.55 + 0.9 * l), u_keepDetail);
  fragColor = vec4(mix(back, subj, m), 1.0);
}
