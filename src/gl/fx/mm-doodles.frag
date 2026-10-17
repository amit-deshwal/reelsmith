#version 300 es
precision highp float;
// Crayon doodles: stars, hearts, spirals, zigzags, scribble circles and crosses scattered over the picture in wax-crayon colours,
// wobbling at 8 fps. The middle of the frame stays clearer so the subject is not covered.
uniform sampler2D u_input;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_density;
uniform float u_size;
uniform float u_clearCentre;
uniform float u_stroke;
in vec2 v_texCoord;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) {
  p.y += 0.55; p *= 1.6;
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
// distance to the stroke of shape `id` in a unit cell, p in about -0.5..0.5
float shape(int id, vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  if (id == 0) { float R = 0.18 + 0.2 * (0.5 + 0.5 * cos(5.0 * a)); return abs(r - R) * 0.9; }                 // star
  if (id == 1) return abs(sdHeart(p * 1.0)) / 1.6;                                                              // heart
  if (id == 2) { float s = fract(r * 7.0 - a / 6.2831853); return (r < 0.42 ? abs(s - 0.5) : 1.0) / 7.0 * 1.4; }  // spiral
  if (id == 3) { float zz = 0.12 * (abs(fract(p.x * 3.0) - 0.5) * 4.0 - 1.0); return abs(p.y - zz) + (abs(p.x) > 0.4 ? 1.0 : 0.0); } // zigzag
  if (id == 4) return abs(r - 0.33 - 0.03 * sin(a * 3.0 + 1.0)) ;                                              // scribble ring
  float d1 = abs(p.x - p.y) + (abs(p.x + p.y) > 0.55 ? 1.0 : 0.0);                                             // cross
  float d2 = abs(p.x + p.y) + (abs(p.x - p.y) > 0.55 ? 1.0 : 0.0);
  return min(d1, d2) * 0.7;
}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec3 base = texture(u_input, v_texCoord).rgb;
  float t = floor(u_time * 8.0);
  vec2 q = v_texCoord * vec2(aspect, 1.0);
  float cellSize = 0.19 * u_size;
  vec2 g = q / cellSize;
  vec2 cell = floor(g);
  vec3 col = base;
  float ink = 0.0;
  vec3 inkCol = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = cell + vec2(float(i), float(j));
    float h = hash(cc * 1.37 + 3.1);
    vec2 centre01 = vec2(hash(cc + 7.7), hash(cc + 9.1));
    vec2 centre = (cc + 0.15 + 0.7 * centre01) * cellSize;
    float dCentre = length((centre / vec2(aspect, 1.0)) - 0.5);
    float keep = mix(1.0, smoothstep(0.12, 0.42, dCentre), u_clearCentre);
    float present = step(1.0 - u_density * keep, hash(cc + 21.3));
    if (present < 0.5) continue;
    vec2 p = (q - centre) / (cellSize * (0.8 + 0.5 * h));
    float ang = (h - 0.5) * 2.5 + (hash(vec2(t, cc.x + cc.y)) - 0.5) * 0.25;
    float cs = cos(ang), sn = sin(ang);
    p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
    p += (vec2(noise(p * 6.0 + t * 1.3 + h * 50.0), noise(p * 6.0 + 9.0 + t * 1.7 + h * 50.0)) - 0.5) * 0.06;   // boil
    int id = int(floor(hash(cc + 5.5) * 6.0));
    float d = shape(id, p);
    float w = 0.034 * u_stroke * (0.8 + 0.4 * noise(p * 14.0 + h * 9.0));
    float a = smoothstep(w, w * 0.45, d) * step(length(p), 0.62);
    float tooth = smoothstep(0.25, 0.6, noise(q * u_resolution.y * 0.5 + t * 3.0));
    a *= 0.55 + 0.45 * tooth;
    if (a > ink) {
      ink = a;
      float k = hash(cc + 31.7) * 6.0;
      inkCol = k < 1.0 ? vec3(1.0, 0.35, 0.45) : k < 2.0 ? vec3(1.0, 0.82, 0.2) : k < 3.0 ? vec3(0.3, 0.75, 1.0) : k < 4.0 ? vec3(0.45, 0.85, 0.4) : k < 5.0 ? vec3(0.75, 0.45, 1.0) : vec3(1.0, 0.6, 0.2);
    }
  }
  col = mix(col, inkCol, ink * 0.92);
  fragColor = vec4(col, 1.0);
}
