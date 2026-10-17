#version 300 es
precision highp float;
// Film damage: gate weave, exposure flicker, dust specks, hairs and vertical scratches, all stepping at 24 fps.
uniform sampler2D u_input;
uniform float u_time;
uniform float u_dust;
uniform float u_scratches;
uniform float u_flicker;
uniform float u_weave;
uniform vec2 u_resolution;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  float frame = floor(u_time * 24.0);
  vec2 weave = vec2(hash(frame) - 0.5, hash(frame + 7.0) - 0.5) * 0.006 * u_weave;
  vec3 c = texture(u_input, clamp(v_texCoord + weave, 0.0, 1.0)).rgb;
  c *= 1.0 + (hash(frame + 3.0) - 0.5) * 0.18 * u_flicker;
  // dust: a few dark/bright specks per frame
  vec2 g = vec2(v_texCoord.x * aspect, v_texCoord.y) * 38.0;
  vec2 cell = floor(g);
  float present = step(1.0 - 0.07 * u_dust, hash2(cell + frame * 1.37));
  vec2 centre = vec2(hash2(cell + 4.1 + frame), hash2(cell + 9.2 + frame));
  float speck = present * smoothstep(0.16, 0.0, length(fract(g) - centre));
  c = mix(c, vec3(hash2(cell + frame) > 0.5 ? 0.95 : 0.04), speck * 0.8);
  // scratches: thin vertical lines that live a few frames
  float sf = floor(u_time * 12.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float on = step(0.55, hash(sf * 3.0 + fi)) * u_scratches;
    float x = hash(sf * 5.0 + fi * 11.0);
    float w = 0.0007 + 0.0006 * hash(sf + fi);
    float line = smoothstep(w, 0.0, abs(v_texCoord.x - x));
    float len = smoothstep(0.0, 0.2, fract(v_texCoord.y * 0.7 + hash(sf + fi * 3.0)));
    c = mix(c, vec3(0.92), line * on * 0.55 * len);
  }
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
