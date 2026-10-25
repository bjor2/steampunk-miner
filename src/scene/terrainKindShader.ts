/**
 * The terrain shader's material looks (ticket 450 under #139; TD shape 6226270701, GD ruling
 * 6226278574): a species draws its own silhouette, pattern and hue over its ore tile, and its
 * rarity a tinted frame round each grain and a glow, all procedural, so the stage binds no new
 * sampler. The silhouette and pattern are chosen per tile by the slot's entry in the look table
 * uniform (`kindLookTable.ts`), never by a `#define`, so the program compiles once; the
 * catalogue they index (`kindLooks.json`) is written into the source as constant tables.
 *
 * A grain is one of eight primitives with a signed edge distance in tiles, so the rarity frame is
 * the band just outside it. Rarity changes the tint, frame and glow only, never the silhouette;
 * with reduce motion (the shake switch, `uGateStill`) the glow holds at its mean and the frame
 * stays still. When the player first meets a species (ticket 698) its rarity rises over a fifth of
 * a second, the glow flaring past its rest on the way unless motion is reduced; the skin under it
 * never changes. The lite program (ticket 477) leaves all of it out and draws the family look.
 *
 * A hero whose sprite is in the resident act's atlas (ticket 451) draws that sprite instead,
 * upright on the planet, with the same rarity tint and glow and a frame just outside its mask. The
 * act's pages (ticket 852) are the layers of one array texture, so a page adds no sampler.
 * The atlas takes the 16th unit only where the startup probe allows it (`TERRAIN_HERO_ATLAS`,
 * fixed when the material is made, so the program still compiles once); without it, or for a
 * hero with no cell, the look table carries no cell and the hero draws its grains.
 *
 * A gem twinkles by its rank k within its planet (ticket 786, `gemGlint.ts`), over its sprite or
 * its grains alike, so every draw path shows it, from the first frame: sparkles whose strength and
 * count come from the ladder's step, and past the authored steps a row of pips in a finish tint
 * along the tile's top as the planet stands. The ladder is written in as constant tables, so a new
 * rank is a data row and the material adds no uniform; reduce motion holds the twinkle at its mean.
 *
 * A generated gem draws a cut of the gem-cut library (ticket 889): a neutral sprite on the
 * hue-tinted pages that follow the act's own, which the shader colours by the kind's hue slot, its
 * luma kept so a facet highlight stays white, under the planet's overlay (`gemOverlays.ts`), one
 * of the grain patterns laid over the cut's luma at a bounded strength. `uGemCuts` says where the
 * tinted cells begin and which overlay the planet wears.
 */
import {
  HERO_ATLAS_CELL_PX,
  HERO_ATLAS_CELLS,
  HERO_ATLAS_CELLS_PER_ROW,
  HERO_ATLAS_GUTTER_PX,
  HERO_ATLAS_SIDE_PX,
} from '../constants/scene'
import { RARITY_REVEAL_FLARE } from '../constants/speciesReveal'
import { GEM_GLINT, type GemGlintLadder } from '../systems/render/gemGlint'
import {
  GEM_GLINT_FLAG,
  HERO_LOOK_CELL_SPAN,
  HERO_LOOK_FLAG,
  KIND_LOOK_SLOTS,
  RARITY_LOOK_LEADS,
} from '../systems/render/kindLookTable'
import {
  KIND_LAYOUTS,
  KIND_LOOKS,
  KIND_PRIMITIVES,
  MAX_KIND_GRAINS,
  PATTERN_PRIMITIVES,
  type KindLookCatalogue,
} from '../systems/render/kindLooks'

/** The table sizes, flags and atlas layout the GLSL below reads, as the material's defines. */
export function kindLookDefines(ladder: GemGlintLadder = GEM_GLINT): Record<string, number> {
  return {
    KIND_LOOK_SLOTS,
    RARITY_LOOK_LEADS,
    HERO_LOOK_FLAG,
    HERO_LOOK_CELL_SPAN,
    GEM_GLINT_FLAG,
    GEM_GLINT_STEPS: ladder.steps.length,
    GEM_GLINT_SPARKLES: ladder.caps.sparkles,
    GEM_GLINT_PIPS: ladder.pips.most,
    GEM_GLINT_FINISHES: ladder.finishes.length,
    MAX_KIND_GRAINS,
    HERO_ATLAS_SIDE_PX,
    HERO_ATLAS_CELL_PX,
    HERO_ATLAS_GUTTER_PX,
    HERO_ATLAS_CELLS_PER_ROW,
    HERO_ATLAS_CELLS,
    RARITY_REVEAL_FLARE,
  }
}

/** The look table's uniforms: the only fragment uniforms the material look adds. */
export const KIND_LOOK_UNIFORMS = /* glsl */ `
#ifndef TERRAIN_LITE
// Per roster slot: silhouette, pattern, colour as 0xRRGGBB, rarity lead + HERO_LOOK_FLAG for a
// hero + GEM_GLINT_FLAG for a gem's glint; zeros draw the family look (kindLookTable.ts).
uniform vec4 uKindLooks[KIND_LOOK_SLOTS];
// Per rarity lead 1 to 4: tint as 0xRRGGBB, glow, frame width in tiles, pulse share of the glow.
uniform vec4 uRarityLooks[RARITY_LOOK_LEADS];
// The first-contact flourish (ticket 698): the roster slot met, the uTime it started, its seconds.
uniform vec4 uRarityReveal;
// The gem cuts (ticket 889, gemCutsLook.ts): the act-wide cell the hue-tinted library pages begin
// at (past every cell with none), the planet's overlay pattern code and its signed strength.
uniform vec4 uGemCuts;
#ifdef TERRAIN_HERO_ATLAS
// The resident act's hero sprites (ticket 451), albedo with the mask in alpha: the 16th unit,
// one layer per page (ticket 852).
uniform sampler2DArray uHeroAtlas;
#endif
#endif
`

/**
 * The material look's functions; they read `hash12`, `rotation`, `uTime` and `uGateStill` from the
 * terrain shader.
 */
export function kindLookFunctionsOf(
  catalogue: KindLookCatalogue = KIND_LOOKS,
  ladder: GemGlintLadder = GEM_GLINT,
): string {
  return `
#ifndef TERRAIN_LITE
${catalogueTablesOf(catalogue)}
${gemGlintTablesOf(ladder)}
${KIND_LOOK_GLSL}
${GEM_GLINT_GLSL}
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

// A five-pointed star of outer radius size, its inner radius inner of it; near enough a distance
// for a frame a pixel or two wide.
float starDistance(vec2 q, float size, float inner) {
  float spoke = abs(cos(atan(q.y, q.x) * 2.5));
  return (length(q) - size * mix(inner, 1.0, spoke * spoke)) * 0.6;
}

// A triangle on its base, apex up the grain's y: extent.x half the base, extent.y half the height.
float triangleDistance(vec2 q, vec2 extent, float shortSide) {
  vec2 h = vec2(abs(q.x) / extent.x, q.y / extent.y);
  return max((2.0 * h.x + h.y - 1.0) * 0.4472136, -h.y - 1.0) * shortSide;
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
  if (primitive == KIND_RING) return abs(length(q) - size) - size * aspect * 0.5;
  if (primitive == KIND_STAR) return starDistance(q, size, aspect);
  if (primitive == KIND_TRIANGLE) return triangleDistance(q, extent, shortSide);
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

// The slot's rarity lead, 0 common to 4 mythic, under any hero cell the entry carries.
int rarityLeadOf(vec4 kind) {
  return int(mod(floor(kind.w + 0.5), float(HERO_LOOK_FLAG)));
}

// How far the slot's rarity has risen: 1 at rest, 0 to 1 over the flourish of the slot just met.
float rarityRevealOf(float kindSlot) {
  if (abs(kindSlot - uRarityReveal.x) > 0.5) return 1.0;
  return clamp((uTime - uRarityReveal.y) / uRarityReveal.z, 0.0, 1.0);
}

// The rarity's tint over its frame and its glow over the frame and what it covers, risen by
// reveal; the glow flares past its rest mid-flourish unless motion is reduced.
void drawRarity(vec4 rarity, float frame, float inside, float reveal, vec2 tile, inout vec3 colour, inout vec3 emissive) {
  vec3 tint = rgbOfPacked(rarity.x);
  colour = mix(colour, tint, frame * reveal);
  float flare = 1.0 + float(RARITY_REVEAL_FLARE) * sin(3.14159265 * reveal) * (1.0 - uGateStill);
  float glow = rarity.y * rarityPulse(rarity.w, uGateStill, tile) * reveal * flare;
  emissive += tint * glow * (0.8 * frame + 0.25 * inside);
}

// Draws the slot's species over the tile and its rarity's frame and glow; answers the share of
// the tile its grains cover, which the ore's own tier glow lights as today's decal.
float drawKindGrains(vec4 kind, float reveal, vec2 local, vec2 tile, float soft, inout vec3 colour, inout vec3 emissive) {
  vec4 grain = kindSilhouette(int(kind.x + 0.5), local, tile);
  float inside = 1.0 - smoothstep(-soft, soft, grain.x);
  float shade = kindPatternShade(int(kind.y + 0.5), local, tile, grain) * grain.y;
  colour = mix(colour, rgbOfPacked(kind.z) * shade, inside);
  int lead = rarityLeadOf(kind);
  if (lead < 1) return inside;
  vec4 rarity = uRarityLooks[lead - 1];
  // A small grain gets a thinner frame, so the rarity rims it rather than hiding it.
  float frameWidth = rarity.z * clamp(KIND_SHAPES[int(kind.x + 0.5)].z / 0.1, 0.5, 1.0);
  float frame = rarityFrame(grain.x, frameWidth, soft);
  drawRarity(rarity, frame, inside, reveal, tile, colour, emissive);
  return inside;
}

#ifdef TERRAIN_HERO_ATLAS
const float HERO_CONTENT_PX = float(HERO_ATLAS_CELL_PX - 2 * HERO_ATLAS_GUTTER_PX);

// The act-wide atlas cell the entry carries (kindLookTable.ts), or -1 for the shader look.
float heroCellOf(vec4 kind) {
  return mod(floor(floor(kind.w + 0.5) / float(HERO_LOOK_FLAG)), float(HERO_LOOK_CELL_SPAN)) - 1.0;
}

// A point of the cell's sprite, 0 to 1 across its content with y down the image, to the atlas:
// the uv on the cell's page and the page's layer (ticket 852: 16 cells a page, page 1 layer 0).
vec3 heroAtlasUv(float cell, vec2 sprite) {
  float layer = floor(cell / float(HERO_ATLAS_CELLS));
  float onPage = cell - layer * float(HERO_ATLAS_CELLS);
  float perRow = float(HERO_ATLAS_CELLS_PER_ROW);
  vec2 corner = vec2(mod(onPage, perRow), floor(onPage / perRow)) * float(HERO_ATLAS_CELL_PX);
  vec2 uv = (corner + float(HERO_ATLAS_GUTTER_PX) + sprite * HERO_CONTENT_PX) / float(HERO_ATLAS_SIDE_PX);
  return vec3(uv, layer);
}

// The sprite's mask a frame's width off the point, clamped into the cell so no neighbour shows.
float heroMaskOff(float cell, vec2 sprite, vec2 off, vec2 dx, vec2 dy) {
  return textureGrad(uHeroAtlas, heroAtlasUv(cell, clamp(sprite + off, 0.0, 1.0)), dx, dy).a;
}

// A neutral cut coloured by the kind's hue (ticket 889): the planet's overlay swings the cut's own
// luma first, then the hue takes the luma below the middle and the luma above it runs to white, so
// a facet highlight stays a highlight whatever the hue.
vec3 gemCutSkin(vec3 skin, vec3 hue, vec2 sprite, vec2 tile) {
  float luma = dot(skin, vec3(0.299, 0.587, 0.114));
  int overlay = int(uGemCuts.y + 0.5);
  if (overlay > 0) {
    vec4 pattern = KIND_PATTERNS[overlay];
    vec4 standIn = vec4(length(sprite - 0.5) - 0.4, 1.0, sprite - 0.5);
    float value = patternValue(int(pattern.x + 0.5), pattern, KIND_PATTERN_AXES[overlay], sprite, tile, standIn);
    luma = clamp(luma * (1.0 + uGemCuts.z * clamp(value, -1.0, 1.0)), 0.0, 1.0);
  }
  vec3 shaded = hue * luma * 2.0;
  vec3 lit = mix(hue, vec3(1.0), (luma - 0.5) * 2.0);
  return luma < 0.5 ? shaded : lit;
}

// Draws the cell's sprite upright on the planet (its image top along up) and the rarity's tint
// and glow, the frame on the band just outside its mask; answers the share of the tile it covers.
// Gradients come from the world's, taken outside the ore branch, since the cell differs per tile.
// A cell on the hue-tinted pages is a neutral gem cut coloured by the kind's hue (ticket 889).
float drawHeroSprite(vec4 kind, float reveal, float cell, vec2 local, vec2 up, vec2 worldDx, vec2 worldDy, vec2 tile, inout vec3 colour, inout vec3 emissive) {
  vec2 right = vec2(up.y, -up.x);
  vec2 fromCentre = local - 0.5;
  vec2 sprite = vec2(dot(fromCentre, right), -dot(fromCentre, up)) + 0.5;
  float toUv = HERO_CONTENT_PX / float(HERO_ATLAS_SIDE_PX);
  vec2 dx = vec2(dot(worldDx, right), -dot(worldDx, up)) * toUv;
  vec2 dy = vec2(dot(worldDy, right), -dot(worldDy, up)) * toUv;
  vec4 texel = textureGrad(uHeroAtlas, heroAtlasUv(cell, sprite), dx, dy);
  float isInCell = step(0.0, sprite.x) * step(sprite.x, 1.0) * step(0.0, sprite.y) * step(sprite.y, 1.0);
  float inside = texel.a * isInCell;
  vec3 skin = linearToDisplay(texel.rgb);
  if (cell >= uGemCuts.x) skin = gemCutSkin(skin, rgbOfPacked(kind.z), sprite, tile);
  colour = mix(colour, skin, inside);
  int lead = rarityLeadOf(kind);
  if (lead < 1) return inside;
  vec4 rarity = uRarityLooks[lead - 1];
  float spread = rarity.z;
  float near = max(
    max(heroMaskOff(cell, sprite, vec2(spread, 0.0), dx, dy), heroMaskOff(cell, sprite, vec2(-spread, 0.0), dx, dy)),
    max(heroMaskOff(cell, sprite, vec2(0.0, spread), dx, dy), heroMaskOff(cell, sprite, vec2(0.0, -spread), dx, dy))
  );
  float frame = clamp(near - texel.a, 0.0, 1.0) * isInCell;
  drawRarity(rarity, frame, inside, reveal, tile, colour, emissive);
  return inside;
}
#endif

// The species' skin over the tile: its hero sprite where the entry carries an atlas cell, else
// its grains.
float drawKindSkin(vec4 kind, float reveal, vec2 local, vec2 tile, vec2 up, vec2 worldDx, vec2 worldDy, float soft, inout vec3 colour, inout vec3 emissive) {
#ifdef TERRAIN_HERO_ATLAS
  float cell = heroCellOf(kind);
  if (cell >= 0.0) return drawHeroSprite(kind, reveal, cell, local, up, worldDx, worldDy, tile, colour, emissive);
#endif
  return drawKindGrains(kind, reveal, local, tile, soft, colour, emissive);
}
`

const GEM_GLINT_GLSL = /* glsl */ `
// The glint code the entry carries (gemGlint.ts), 0 for a species that is no gem.
float gemGlintCodeOf(vec4 kind) {
  return floor(floor(kind.w + 0.5) / float(GEM_GLINT_FLAG));
}

// One four-armed sparkle of half arm length size round centre, brightest at its heart.
float gemSparkle(vec2 local, vec2 centre, float size) {
  vec2 q = abs(local - centre);
  float arm = size * 0.2;
  float upright = step(q.x, arm) * max(0.0, 1.0 - q.y / size);
  float across = step(q.y, arm) * max(0.0, 1.0 - q.x / size);
  return max(upright, across);
}

// The step's sparkles over the tile's middle, each twinkling between half and all of its light;
// held at the mean with reduce motion.
float gemSparkles(vec4 rung, vec2 local, vec2 tile) {
  float light = 0.0;
  for (int i = 0; i < GEM_GLINT_SPARKLES; i++) {
    if (float(i) >= rung.y) break;
    vec2 seed = tile + float(i) * 13.7 + 5.0;
    vec2 centre = 0.25 + 0.5 * vec2(hash12(seed), hash12(seed + 1.3));
    float wave = 0.5 + 0.5 * sin(uTime * 3.1 + hash12(seed + 8.2) * 6.2832);
    float twinkle = 1.0 - 0.5 * mix(wave, 0.5, uGateStill);
    light = max(light, gemSparkle(local, centre, rung.z) * twinkle);
  }
  return light;
}

// 1 on the count pips in a row along the tile's top as the planet stands, soft by about a pixel.
float gemPips(float count, vec2 local, vec2 up, float soft) {
  vec2 fromCentre = local - 0.5;
  vec2 q = vec2(dot(fromCentre, vec2(up.y, -up.x)), dot(fromCentre, up));
  float pip = 0.0;
  for (int i = 0; i < GEM_GLINT_PIPS; i++) {
    if (float(i) >= count) break;
    vec2 centre = vec2((float(i) - 0.5 * (count - 1.0)) * GEM_PIP_PITCH, GEM_PIP_ROW);
    pip = max(pip, 1.0 - smoothstep(GEM_PIP_RADIUS - soft, GEM_PIP_RADIUS + soft, length(q - centre)));
  }
  return pip;
}

// The gem's rank glint over its skin: the step's sparkles, and past the authored steps the pips
// of its rank in its finish's tint (gemGlint.ts gemGlintOfCode unpacks the same code).
void drawGemGlint(vec4 kind, vec2 local, vec2 tile, vec2 up, float soft, inout vec3 colour, inout vec3 emissive) {
  float code = gemGlintCodeOf(kind);
  if (code < 0.5) return;
  float steps = float(GEM_GLINT_STEPS);
  float pipSpan = float(GEM_GLINT_PIPS + 1);
  float above = floor((code - 1.0) / steps);
  int rung = clamp(int(code - 1.0 - above * steps + 0.5), 0, GEM_GLINT_STEPS - 1);
  int finish = clamp(int(floor(above / pipSpan) + 0.5), 0, GEM_GLINT_FINISHES);
  float pips = above - floor(above / pipSpan) * pipSpan;
  vec4 look = GEM_GLINT_RUNGS[rung];
  vec3 tint = GEM_GLINT_TINTS[finish];
  emissive += tint * look.x * gemSparkles(look, local, tile);
  float pip = gemPips(pips, local, up, soft);
  colour = mix(colour, tint, pip);
  emissive += tint * look.x * pip;
}

// The species' look over the tile: its skin, then a gem's rank glint over it. up is the planet's
// up at the tile; the world gradients serve the sprite's sampling; reveal is how far the rarity
// has risen (rarityRevealOf).
float drawKindTile(vec4 kind, float reveal, vec2 local, vec2 tile, vec2 up, vec2 worldDx, vec2 worldDy, float soft, inout vec3 colour, inout vec3 emissive) {
  float inside = drawKindSkin(kind, reveal, local, tile, up, worldDx, worldDy, soft, colour, emissive);
  drawGemGlint(kind, local, tile, up, soft, colour, emissive);
  return inside;
}
`

/**
 * The glint ladder as constant tables: a step's (strength, sparkles, half arm, 0) by rank, the
 * tints (the ladder's, then each finish's) and the pip row's measures.
 */
function gemGlintTablesOf({ steps, tint, finishes, pips }: GemGlintLadder): string {
  const rungs = steps.map((step) => vec4Of([step.strength, step.sparkles, step.size, 0]))
  const tints = [tint, ...finishes].map((colour) => `vec3(${colour.map(glslFloatOf).join(', ')})`)
  return [
    constListOf('vec4', 'GEM_GLINT_RUNGS', rungs),
    constListOf('vec3', 'GEM_GLINT_TINTS', tints),
    `const float GEM_PIP_RADIUS = ${glslFloatOf(pips.radius)};`,
    `const float GEM_PIP_PITCH = ${glslFloatOf(pips.pitch)};`,
    `const float GEM_PIP_ROW = ${glslFloatOf(PIP_ROW_FROM_CENTRE - pips.radius)};`,
  ].join('\n')
}

/** How far from the tile's centre, toward its top, the pip row's far edge sits, in tiles. */
const PIP_ROW_FROM_CENTRE = 0.46

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
  return constListOf(type, name, [`${type}(0.0)`, ...rows])
}

function constListOf(type: string, name: string, rows: readonly string[]): string {
  const length = rows.length
  return `const ${type} ${name}[${length}] = ${type}[${length}](\n  ${rows.join(',\n  ')}\n);`
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
