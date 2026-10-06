/**
 * `fx-blast-scorch` (#109 "the blast leaves scorch marks on the tunnel edge", art #110: a code
 * shader). One quad per blast, centred on the charge tile: soot darkest in a ring at the blast's
 * edge, fading inward into the crater and outward into the rock, mottled by a hash of the quad's
 * own seed so no two scorches match. It only darkens what is behind it.
 */
export const SCORCH_VERTEX_SHADER = /* glsl */ `
varying vec2 vOffset;
uniform float uHalfSize;

void main() {
  vOffset = (uv - 0.5) * 2.0 * uHalfSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const SCORCH_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vOffset;
uniform vec3 uColour;
uniform float uRadius;
uniform float uInnerFade;
uniform float uOuterFade;
uniform float uDarkness;
uniform float uSeed;

float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7)) + uSeed * 74.7) * 43758.5453);
}

float mottle(vec2 at) {
  vec2 cell = floor(at);
  vec2 f = fract(at);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

void main() {
  float distance = length(vOffset);
  float inner = smoothstep(uRadius - uInnerFade, uRadius, distance);
  float outer = 1.0 - smoothstep(uRadius, uRadius + uOuterFade, distance);
  float soot = inner * outer * (0.55 + 0.45 * mottle(vOffset * 2.5));
  gl_FragColor = vec4(uColour, soot * uDarkness);
}
`
