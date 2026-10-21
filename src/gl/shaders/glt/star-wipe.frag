#version 300 es
precision highp float;
precision highp int;

// Star wipe (Reels). The next shot opens inside a growing star. Celebration, kids, a retro joke.
// Adapted from GL Transitions "StarWipe" (MIT, gl-transitions contributors): wrapped in the two-input contract,
// tunable uniforms fixed at their defaults. Regenerate with server/reelsmith/import-gl-transitions.mts.
uniform sampler2D u_outgoing;
uniform sampler2D u_incoming;
uniform float u_progress;
uniform float u_aspect;

in vec2 v_texCoord;
out vec4 fragColor;

float progress;
float ratio;
vec4 getFromColor(vec2 uv) { return texture(u_outgoing, uv); }
vec4 getToColor(vec2 uv) { return texture(u_incoming, uv); }

// ---- GL Transitions source ----
// Author: Ben Lucas
// License: MIT
// Description: A growing star reveals the incoming image
// Tags: wipe, shape, star
#define PI 3.141592653589793
#define STAR_ANGLE 1.2566370614359172

// @param Thickness of the star's border
const float border_thickness = 0.01;
const float star_rotation = 0.75;
// @color Color of the star's border
const vec4 border_color = vec4(1.0);
// @param Center of the star
const vec2 star_center = vec2(0.5);

vec2 rotate(vec2 v, float theta) {
    float cosTheta = cos(theta);
    float sinTheta = sin(theta);

    return vec2(
        cosTheta * v.x - sinTheta * v.y,
        sinTheta * v.x + cosTheta * v.y
    );
}

bool inStar(vec2 uv, vec2 center, float radius){
  vec2 uv_centered = uv - center;
  uv_centered = rotate(uv_centered, star_rotation * STAR_ANGLE);
  float theta = atan(uv_centered.y, uv_centered.x) + PI;

  vec2 uv_rotated = rotate(uv_centered, -STAR_ANGLE * (floor(theta / STAR_ANGLE) + 0.5));

  float slope = 0.3;
  if(uv_rotated.y > 0.0){
      return (radius + uv_rotated.x * slope > uv_rotated.y);
  } else {
     return (-radius - uv_rotated.x * slope < uv_rotated.y);
  }
}

vec4 transition (vec2 uv) {
  float progressScaled = (2.0 * border_thickness + 1.0) * progress - border_thickness;
  if(inStar(uv, star_center, progressScaled)){
    return getToColor(uv);
  } else if(inStar(uv, star_center, progressScaled+border_thickness)){
    return border_color;
  } else {
    return getFromColor(uv);
  }
}

// ---- end ----

void main() {
  progress = u_progress;
  ratio = u_aspect;
  fragColor = vec4(transition(v_texCoord).rgb, 1.0);
}
