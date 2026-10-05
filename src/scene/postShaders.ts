/**
 * The post-processing shaders (#38 "Post-processing"): one full-screen triangle each. The scene
 * arrives in linear light; the composite writes display (sRGB) values to the canvas.
 */

export const FULL_SCREEN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** Keeps the light above the threshold, with a soft knee, at half resolution. */
export const BRIGHT_PASS_SHADER = /* glsl */ `
uniform sampler2D uScene;
uniform float uThreshold;
varying vec2 vUv;

void main() {
  vec3 colour = texture2D(uScene, vUv).rgb;
  float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  float share = smoothstep(uThreshold, uThreshold + 0.25, luminance);
  gl_FragColor = vec4(colour * share, 1.0);
}
`

/** A 9-tap Gaussian along one axis; run once across and once down. */
export const BLUR_SHADER = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uStep;
varying vec2 vUv;

void main() {
  vec3 sum = texture2D(uSource, vUv).rgb * 0.227027;
  sum += texture2D(uSource, vUv + uStep * 1.384615).rgb * 0.316216;
  sum += texture2D(uSource, vUv - uStep * 1.384615).rgb * 0.316216;
  sum += texture2D(uSource, vUv + uStep * 3.230769).rgb * 0.070270;
  sum += texture2D(uSource, vUv - uStep * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`

/**
 * Scene plus bloom, a filmic shoulder (identity under the knee, rolling off to white above it),
 * the vignette, then the sRGB transfer the canvas expects.
 */
export const COMPOSITE_SHADER = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uKnee;
uniform float uVignette;
varying vec2 vUv;

vec3 shoulder(vec3 colour) {
  vec3 over = max(colour - uKnee, 0.0);
  vec3 rolled = uKnee + (1.0 - uKnee) * (1.0 - exp(-over / (1.0 - uKnee)));
  return mix(colour, rolled, step(uKnee, colour));
}

vec3 linearToDisplay(vec3 colour) {
  vec3 low = colour * 12.92;
  vec3 high = 1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), colour));
}

void main() {
  vec3 colour = texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uBloomStrength;
  colour = shoulder(colour);
  vec2 fromCentre = vUv - 0.5;
  colour *= 1.0 - uVignette * smoothstep(0.25, 0.75, length(fromCentre));
  gl_FragColor = vec4(linearToDisplay(clamp(colour, 0.0, 1.0)), 1.0);
}
`
