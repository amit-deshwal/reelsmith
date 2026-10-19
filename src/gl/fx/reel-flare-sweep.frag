#version 300 es
precision highp float;
// Flare sweep: a sun-like lens flare drifts across the top of the frame (glow, a long streak and coloured ghosts through the
// middle), as if the camera panned past the sun. Golden hour, beach, drone shots, an intro.
uniform sampler2D u_input;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;         // frame widths per second
uniform float u_y;             // where the sun travels, 0 top .. 1 bottom
uniform float u_intensity;
uniform float u_warmth;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord;
  vec4 base = texture(u_input, uv);
  float aspect = u_resolution.x / u_resolution.y;
  vec2 sun = vec2(-0.2 + fract(u_time * u_speed * 0.7) * 1.4, 1.0 - u_y);
  vec2 d = (uv - sun) * vec2(aspect, 1.0);
  float r = length(d);
  vec3 warm = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.78, 0.5), u_warmth);
  vec3 col = warm * (exp(-r * 9.0) * 1.2 + exp(-r * 2.5) * 0.25);
  col += warm * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.2) * 0.7;
  vec2 axis = vec2(0.5) - sun;
  for (int i = 0; i < 5; i++) {
    float k = -0.4 + float(i) * 0.45;
    vec2 g = sun + axis * (1.0 + k);
    float gr = length((uv - g) * vec2(aspect, 1.0));
    float size = 0.03 + 0.025 * float(i);
    vec3 tint = 0.5 + 0.5 * cos(6.2831 * (float(i) * 0.21 + vec3(0.0, 0.33, 0.67)));
    col += tint * smoothstep(size, size * 0.6, gr) * 0.12;
  }
  fragColor = vec4(min(base.rgb + col * u_intensity * base.a, vec3(1.0)), base.a);
}
