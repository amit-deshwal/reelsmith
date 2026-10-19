#version 300 es
precision highp float;
// Landscape title: thin, widely spaced capitals that rise into the sky from behind the scenery. The title is drawn only
// where the picture looks like sky (bright or blue, and smooth), so ridges, trees and people stay in front of it.
uniform sampler2D u_input;
uniform sampler2D u_text;      // white text on black (textLayer "scenery" cell)
uniform float u_textAspect;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_y;             // title centre, 0 top .. 1 bottom
uniform float u_size;          // title height as a share of the frame height
uniform float u_opacity;
uniform float u_rise;          // seconds the title takes to rise into place
uniform float u_delay;         // seconds before it starts
uniform float u_outline;       // 1 hollow outline, 0 solid
uniform float u_sky;           // how readily a pixel counts as sky (0 strict .. 1 loose)
in vec2 v_texCoord;
out vec4 fragColor;

float skyness(vec2 uv) {
  vec3 c = texture(u_input, uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float blue = c.b - max(c.r, c.g) * 0.92;
  vec2 px = 2.0 / u_resolution;
  float l1 = dot(texture(u_input, uv + vec2(px.x, 0.0)).rgb, vec3(0.333));
  float l2 = dot(texture(u_input, uv + vec2(0.0, px.y)).rgb, vec3(0.333));
  float detail = abs(l1 - lum) + abs(l2 - lum);
  float s = smoothstep(0.42 - 0.2 * u_sky, 0.72 - 0.2 * u_sky, lum) * 0.75 + smoothstep(0.0, 0.1, blue) * 0.6;
  return clamp(s - smoothstep(0.03, 0.12, detail) * 0.8, 0.0, 1.0);
}

void main() {
  vec2 uv = v_texCoord;
  vec4 base = texture(u_input, uv);
  float p = clamp((u_time - u_delay) / max(0.05, u_rise), 0.0, 1.0);
  float e = 1.0 - pow(1.0 - p, 3.0);
  float h = u_size;
  float w = h * u_textAspect * (u_resolution.y / u_resolution.x);
  // texture y runs up: the centre in uv space, sinking below its place before the rise
  float cy = (1.0 - u_y) - (1.0 - e) * h * 1.8;
  vec2 t = (uv - vec2(0.5 - w * 0.5, cy - h * 0.5)) / vec2(w, h);
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) { fragColor = base; return; }
  vec2 tc = t;   // the text texture is uploaded flipped already: same orientation as u_input
  float f = texture(u_text, tc).r;
  // outline: the letter grown by a hair minus the letter shrunk by a hair
  vec2 o = vec2(0.006 / max(0.2, u_textAspect), 0.012);
  float mx = f, mn = f;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    float s = texture(u_text, tc + vec2(cos(a), sin(a)) * o).r;
    mx = max(mx, s); mn = min(mn, s);
  }
  float edge = clamp((mx - mn) * 1.4, 0.0, 1.0);
  float ink = mix(f, edge, u_outline);
  float mask = smoothstep(0.35, 0.65, skyness(uv));
  float a = ink * mask * u_opacity * smoothstep(0.0, 0.35, p);
  fragColor = vec4(mix(base.rgb, vec3(1.0), a), base.a);
}
