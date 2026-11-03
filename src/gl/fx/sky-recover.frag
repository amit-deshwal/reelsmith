#version 300 es
precision highp float;
// Sky recover (RS-1261): brings back a washed-out phone sky. On the sky map (u_sky, white = sky) the sky is darkened more
// toward the top like a graduated ND filter, given contrast so the clouds show, more colour and a little more blue. Without
// a sky map it is a plain graduated filter over the top of the frame.
uniform sampler2D u_input;
uniform sampler2D u_sky;
uniform float u_hasSky;
uniform float u_strength;
uniform float u_blue;
in vec2 v_texCoord;
out vec4 fragColor;
// --- skyAt (RS-1261; the same text in reel-mix, sky-recover and sky-swap: src/gl/fx/skyAt.glsl.txt) ---
// The sky at this pixel of this frame. u_sky: red = the sky in the frame the map was made from, green = where the sky can
// be in other frames of the shot. With the sky's colour model (u_hasSkyModel) the sky is found again in each frame by its
// colour: inside the map with a looser test (grey clouds stay in, a head that moves in drops out), and in the rest of the
// gate with the full one (sky a moving camera uncovers). Its colours run on a line from its own colour to grey.
uniform vec2 u_skyChroma;
uniform vec2 u_skySpread;
uniform float u_skyLimit;
uniform vec2 u_skyLuma; // x: the darkest sky; y: how bright a paler-than-sky pixel must be
uniform float u_hasSkyModel;
float skyColour(vec3 c, float widen, float needPale) {
  float s = c.r + c.g + c.b + 0.004;
  vec2 ch = vec2(c.r, c.g) / s;
  vec2 b = vec2(1.0 / 3.0) - u_skyChroma;
  float t = clamp(dot(ch - u_skyChroma, b) / max(dot(b, b), 1e-9), 0.0, 1.0);
  float d = length((ch - u_skyChroma - t * b) / max(u_skySpread, vec2(1e-4)));
  float lim = u_skyLimit * widen;
  float colour = 1.0 - smoothstep(lim * 0.85, lim * 1.2, d);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float bright = smoothstep(u_skyLuma.x - 0.04, u_skyLuma.x + 0.02, l);
  float pale = mix(1.0, smoothstep(u_skyLuma.y - 0.04, u_skyLuma.y + 0.02, l), smoothstep(0.15, 0.25, t) * needPale);
  float mx = max(c.r, max(c.g, c.b));
  float haze = (1.0 - smoothstep(0.2, 0.26, (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-3))) * smoothstep(u_skyLuma.y - 0.04, u_skyLuma.y + 0.02, l) * needPale;
  return max(colour * bright * pale, haze);
}
// `pic`: the picture the colour is read from. The colour is averaged over a few pixels round uv, so far hazy land that is
// nearly sky-coloured comes out one way or the other in patches, not speckled.
float skyAt(vec2 uv, sampler2D pic) {
  vec4 m = texture(u_sky, uv);
  if (u_hasSkyModel < 0.5) return m.r;
  vec2 o = 6.0 / vec2(textureSize(pic, 0));
  vec3 c = (texture(pic, uv).rgb * 2.0 + texture(pic, uv + vec2(o.x, 0.0)).rgb + texture(pic, uv - vec2(o.x, 0.0)).rgb
    + texture(pic, uv + vec2(0.0, o.y)).rgb + texture(pic, uv - vec2(0.0, o.y)).rgb) / 6.0;
  return max(m.r * skyColour(c, 1.4, 0.0), m.g * skyColour(c, 0.8, 1.0));
}
// --- end skyAt ---
void main() {
  vec4 src = texture(u_input, v_texCoord);
  float y = v_texCoord.y; // 1 = top
  float sky = u_hasSky > 0.5 ? skyAt(v_texCoord, u_input) : smoothstep(0.55, 0.9, y);
  float s = clamp(u_strength, 0.0, 1.5);
  vec3 c = src.rgb;
  // graduated: strongest at the top, a third as strong near the horizon
  float grad = mix(0.35, 1.0, smoothstep(0.3, 1.0, y));
  c *= 1.0 - 0.3 * s * grad;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.0 + 0.5 * s);                 // colour back
  c = (c - l) + (l - 0.45) * (1.0 + 0.45 * s) + 0.45; // cloud contrast about mid-grey
  c *= mix(vec3(1.0), vec3(0.9, 0.97, 1.12), clamp(u_blue, 0.0, 1.0) * s);
  fragColor = vec4(mix(src.rgb, clamp(c, 0.0, 1.0), sky), src.a);
}
