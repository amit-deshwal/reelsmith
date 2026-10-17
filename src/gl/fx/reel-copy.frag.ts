// GENERATED from src/gl/fx/reel-copy.frag by scripts/sync-shader-sources.mjs — do not edit.
export default "#version 300 es\nprecision highp float;\n// Pass-through: lets a multi-pass effect keep the original picture as its own pass to composite over later.\nuniform sampler2D u_input;\nin vec2 v_texCoord;\nout vec4 fragColor;\nvoid main() { fragColor = texture(u_input, v_texCoord); }\n";
