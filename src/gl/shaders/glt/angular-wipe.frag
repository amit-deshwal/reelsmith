#version 300 es
precision highp float;
precision highp int;

// Angular wipe (Reels). A radial wipe from the edge sweeps round the frame. Clean, graphic change of place.
// Adapted from GL Transitions "angular" (MIT, gl-transitions contributors): wrapped in the two-input contract,
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
// Author: Fernando Kuteken
// License: MIT
// Description: A wipe that sweeps around the center from a starting angle
// Tags: wipe, radial, clock

#define PI 3.141592653589

// @range(0, 360) Angle where the wipe starts, in degrees
const float startingAngle = 90.0;

vec4 transition (vec2 uv) {
  
  float offset = startingAngle * PI / 180.0;
  float angle = atan(uv.y - 0.5, uv.x - 0.5) + offset;
  float normalizedAngle = (angle + PI) / (2.0 * PI);
  
  normalizedAngle = normalizedAngle - floor(normalizedAngle);

  return mix(
    getFromColor(uv),
    getToColor(uv),
    step(normalizedAngle, progress)
    );
}

// ---- end ----

void main() {
  progress = u_progress;
  ratio = u_aspect;
  fragColor = vec4(transition(v_texCoord).rgb, 1.0);
}
