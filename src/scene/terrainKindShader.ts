/**
 * The terrain shader's material looks (ticket 450 under #139; TD shape 6226270701, GD ruling
 * 6226278574): a species draws its own silhouette, pattern and hue over its ore tile, and its
 * rarity a tinted frame round each grain and a glow, all procedural, so the stage binds no new
 * sampler. The silhouette and pattern are chosen per tile by the slot's entry in the look table
 * uniform (`kindLookTable.ts`), never by a `#define`, so the program compiles once; the
 * catalogue they index (`kindLooks.json`) is written into the source as constant tables.
 *
 * A grain is one of five primitives with a signed edge distance in tiles, so the rarity frame is
 * the band just outside it. Rarity changes the tint, frame and glow only, never the silhouette;
 * with reduce motion (the shake switch, `uGateStill`) the glow holds at its mean and the frame
 * stays still. The lite program (ticket 477) leaves all of it out and draws the family look.
 */
import { HERO_LOOK_FLAG, KIND_LOOK_SLOTS, RARITY_LOOK_LEADS } from '../systems/render/kindLookTable'
import {
  KIND_LAYOUTS,
  KIND_LOOKS,
  KIND_PRIMITIVES,
  MAX_KIND_GRAINS,
  PATTERN_PRIMITIVES,
  type KindLookCatalogue,
} from '../systems/render/kindLooks'

/** The table sizes and flag the GLSL below reads, as the material's defines. */
export function kindLookDefines(): Record<string, number> {
  return { KIND_LOOK_SLOTS, RARITY_LOOK_LEADS, HERO_LOOK_FLAG, MAX_KIND_GRAINS }
}

/** The look table's uniforms: the only fragment uniforms the material look adds. */
export const KIND_LOOK_UNIFORMS = /* glsl */ `
#ifndef TERRAIN_LITE
// Per roster slot: silhouette, pattern, colour as 0xRRGGBB, rarity lead + HERO_LOOK_FLAG for a
// hero; zeros draw the family look (kindLookTable.ts).
uniform vec4 uKindLooks[KIND_LOOK_SLOTS];
// Per rarity lead 1 to 4: tint as 0xRRGGBB, glow, frame width in tiles, pulse share of the glow.
uniform vec4 uRarityLooks[RARITY_LOOK_LEADS];
#endif
`

/** The material look's functions; they read `hash12` and `rotation` from the terrain shader. */
export function kindLookFunctionsOf(catalogue: KindLookCatalogue = KIND_LOOKS): string {
  return `
#ifndef TERRAIN_LITE
${catalogueTablesOf(catalogue)}
${KIND_LOOK_GLSL}
#endif
`
}

const KIND_LOOK_GLSL = /* glsl */ `
vec3 rgbOfPacked(float packed) {
  float red = floor(packed / 65536.0);
  float green = floor((packed - red * 65536.0) / 256.0);
  float blue = packed - red * 65536.0 - green * 256.0;
  return vec3(red, green, blue) / 255.0;
}

// The slot's table entry; zeros for no kind or a slot past the table.
vec4 kindLookOf(float kindSlot) {
  int at = int(kindSlot + 0.5) - 1;
  if (at < 0 || at >= KIND_LOOK_SLOTS) return vec4(0.0);
  return uKindLooks[at];
}

// Signed distance in tiles from a grain's edge, below 0 inside, in the grain's own frame.
float grainDistance(int primitive, vec2 q, float size, float aspect) {
  vec2 extent = vec2(size, size * aspect);
  vec2 a = abs(q);
  float shortSide = min(extent.x, extent.y);
  vec2 h = a / extent;
  if (primitive == KIND_BOX) return max(a.x - extent.x, a.y - extent.y);
  if (primitive == KIND_DIAMOND) return (h.x + h.y - 1.0) * shortSide * 0.7;
  if (primitive == KIND_DISC) return (length(h) - 1.0) * shortSide;
  if (primitive == KIND_HEXAGON) return (max(h.x, h.y * 0.8660254 + h.x * 0.5) - 1.0) * shortSide;
  return length(vec2(max(a.x - size, 0.0), a.y)) - size * aspect;
}

vec2 grainCentre(int arrangement, float at, float count, vec2 seed) {
  float even = 0.12 + 0.76 * (at + 0.5) / count;
  float wander = mix(0.36, 0.64, hash12(seed + 2.3));
  if (arrangement == KIND_ROW) return vec2(even, wander);
  if (arrangement == KIND_STACK) return vec2(wander, even);
  return 0.22 + 0.56 * vec2(hash12(seed), hash12(seed + 5.7));
}

// x: the nearest grain's signed edge distance in tiles, y: its facet shade, zw: the point in
// that grain's frame.
vec4 kindSilhouette(int code, vec2 local, vec2 tile) {
  vec4 shape = KIND_SHAPES[code];
  vec4 scatter = KIND_SCATTERS[code];
  vec4 nearest = vec4(8.0, 1.0, 0.0, 0.0);
  for (int i = 0; i < MAX_KIND_GRAINS; i++) {
    if (float(i) >= shape.y) break;
    vec2 seed = tile + float(i) * 17.31 + float(code) * 3.7;
    vec2 centre = grainCentre(int(scatter.y), float(i), shape.y, seed);
    vec2 q = rotation((hash12(seed + 9.1) - 0.5) * scatter.x) * (local - centre);
    float distance = grainDistance(int(shape.x), q, shape.z, shape.w);
    if (distance < nearest.x) nearest = vec4(distance, q.x > 0.0 ? 1.0 : 0.72, q);
  }
  return nearest;
}

float smoothNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(cell);
  float b = hash12(cell + vec2(1.0, 0.0));
  float c = hash12(cell + vec2(0.0, 1.0));
  float d = hash12(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// The pattern's raw value in -1..1 over a grain; grain is the kindSilhouette answer.
float patternValue(int primitive, vec4 pattern, vec2 axis, vec2 local, vec2 tile, vec4 grain) {
  vec2 p = local + mod(tile, 64.0);
  float scale = pattern.y;
  float along = dot(local - 0.5, axis);
  if (primitive == PATTERN_MOTTLE) return smoothNoise(p * scale) * 2.0 - 1.0;
  if (primitive == PATTERN_CRUST) return grain.x > -scale ? -1.0 : 0.3;
  if (primitive == PATTERN_BANDS) return step(0.5, fract(along * scale)) * 2.0 - 1.0;
  if (primitive == PATTERN_CLOUD) return smoothNoise(p * scale) * 1.2 - 0.2;
  if (primitive == PATTERN_GLOSS) return 1.0 - smoothstep(0.0, 0.08 * scale, abs(along - 0.1));
  if (primitive == PATTERN_SPECKLE) return step(0.82, hash12(floor(p * scale))) * 2.0 - 0.6;
  if (primitive == PATTERN_CORE) return clamp(-grain.x / 0.06, 0.0, 1.0) * 2.0 - 1.0;
  if (primitive == PATTERN_RINGS) return step(0.5, fract(length(grain.zw) * scale)) * 2.0 - 1.0;
  if (primitive == PATTERN_VEINS) {
    return 0.25 - 1.25 * (1.0 - smoothstep(0.0, 0.06, abs(smoothNoise(p * scale) - 0.5)));
  }
  if (primitive == PATTERN_FIBRES) return sin(dot(local, vec2(-axis.y, axis.x)) * scale * 6.2832);
  return 0.0;
}

// The shade the pattern lays over a grain, 1 plus or minus its contrast.
float kindPatternShade(int code, vec2 local, vec2 tile, vec4 grain) {
  vec4 pattern = KIND_PATTERNS[code];
  float value = patternValue(int(pattern.x), pattern, KIND_PATTERN_AXES[code], local, tile, grain);
  return 1.0 + pattern.z * clamp(value, -1.0, 1.0);
}

// 1 on the band of width frame just outside a grain's edge, soft by about a pixel.
float rarityFrame(float distance, float frame, float soft) {
  if (frame <= 0.0) return 0.0;
  return smoothstep(-soft, soft, distance) * (1.0 - smoothstep(frame - soft, frame + soft, distance));
}

// The glow's swing: its whole when still, else pulse of it rising and falling round the mean.
float rarityPulse(float pulse, float still, vec2 tile) {
  float wave = 0.5 + 0.5 * sin(uTime * 2.4 + hash12(tile + 4.4) * 6.2832);
  return 1.0 - pulse * mix(wave, 0.5, still);
}

// Draws the slot's species over the tile and its rarity's frame and glow; answers the share of
// the tile its grains cover, which the ore's own tier glow lights as today's decal.
float drawKindGrains(vec4 kind, vec2 local, vec2 tile, float soft, inout vec3 colour, inout vec3 emissive) {
  vec4 grain = kindSilhouette(int(kind.x + 0.5), local, tile);
  float inside = 1.0 - smoothstep(-soft, soft, grain.x);
  float shade = kindPatternShade(int(kind.y + 0.5), local, tile, grain) * grain.y;
  colour = mix(colour, rgbOfPacked(kind.z) * shade, inside);
  int lead = int(mod(floor(kind.w + 0.5), float(HERO_LOOK_FLAG)));
  if (lead < 1) return inside;
  vec4 rarity = uRarityLooks[lead - 1];
  vec3 tint = rgbOfPacked(rarity.x);
  // A small grain gets a thinner frame, so the rarity rims it rather than hiding it.
  float frameWidth = rarity.z * clamp(KIND_SHAPES[int(kind.x + 0.5)].z / 0.1, 0.5, 1.0);
  float frame = rarityFrame(grain.x, frameWidth, soft);
  colour = mix(colour, tint, frame);
  float glow = rarity.y * rarityPulse(rarity.w, uGateStill, tile);
  emissive += tint * glow * (0.8 * frame + 0.25 * inside);
  return inside;
}
`

function catalogueTablesOf({ silhouettes, patterns }: KindLookCatalogue): string {
  const shapes = silhouettes.map((row) =>
    vec4Of([KIND_PRIMITIVES.indexOf(row.primitive), row.count, row.size, row.aspect]),
  )
  const scatters = silhouettes.map((row) =>
    vec4Of([row.turn * Math.PI, KIND_LAYOUTS.indexOf(row.layout), 0, 0]),
  )
  const looks = patterns.map((row) =>
    vec4Of([PATTERN_PRIMITIVES.indexOf(row.primitive), row.scale, row.contrast, 0]),
  )
  const axes = patterns.map((row) => vec2OfAngle(row.angle))
  return [
    ...KIND_PRIMITIVES.map((name, at) => `const int KIND_${name.toUpperCase()} = ${at};`),
    ...KIND_LAYOUTS.map((name, at) => `const int KIND_${name.toUpperCase()} = ${at};`),
    ...PATTERN_PRIMITIVES.map((name, at) => `const int PATTERN_${name.toUpperCase()} = ${at};`),
    constTableOf('vec4', 'KIND_SHAPES', shapes),
    constTableOf('vec4', 'KIND_SCATTERS', scatters),
    constTableOf('vec4', 'KIND_PATTERNS', looks),
    constTableOf('vec2', 'KIND_PATTERN_AXES', axes),
  ].join('\n')
}

/** Code 0 is the family look, so every table starts with an unused row. */
function constTableOf(type: string, name: string, rows: readonly string[]): string {
  const all = [`${type}(0.0)`, ...rows]
  const length = all.length
  return `const ${type} ${name}[${length}] = ${type}[${length}](\n  ${all.join(',\n  ')}\n);`
}

function vec4Of(values: readonly number[]): string {
  return `vec4(${values.map(glslFloatOf).join(', ')})`
}

function vec2OfAngle(degrees: number): string {
  const radians = (degrees * Math.PI) / 180
  return `vec2(${glslFloatOf(Math.cos(radians))}, ${glslFloatOf(Math.sin(radians))})`
}

/** A float literal GLSL reads: always a point, never an exponent. */
export function glslFloatOf(value: number): string {
  const fixed = value.toFixed(6).replace(/0+$/, '')
  return fixed.endsWith('.') ? `${fixed}0` : fixed
}
