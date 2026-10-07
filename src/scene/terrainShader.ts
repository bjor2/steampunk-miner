/**
 * The terrain's one shader (#13 Visual direction, #22): every chunk mesh draws with it, so a
 * chunk is one draw call with its edge highlight, noise texture, ore decal, ore glow, sparkles and
 * lighting all in it. Instance attributes come from `buildChunkTileBatch`; style and silhouette
 * codes are the ones it exports. Each quad is cut along the ground's surface (#36): the chunk's
 * density halo is a texture, blended bilinearly between samples, and a fragment below 128 is air.
 * The edge highlight is the band just inside that contour. Colours are worked in display (sRGB)
 * values, the flat look of #13, and turned into linear light as the last step, because the frame
 * goes through the post pipeline (#38), whose composite writes display values back out.
 *
 * The artefact cache (#46) is a brass casket whose rune ring glows while it is live to the local
 * player and goes dull as a husk once they hold an artefact (`uCacheLive`). With `ore_whisper`
 * held and the vehicle undocked (`uWhisper`), flagged ore within `uWhisperRange` of the vehicle
 * pulses at its rim, through the rock in front of it.
 *
 * Lighting is the vehicle lamp, ambient light that fades with depth, and the scene's point lights
 * (#13, #38: the lamp plus at most 4 point lights; `LightRig` chooses them, an unused one is black). Ore glow, sparkles and the core's pulse are emissive, so
 * ore stays readable in the dark and by shape and brightness, not colour alone.
 *
 * On a heat planet (#113, #114) a lava cell draws the lava tile, its glow scrolling slowly and
 * pulsing, and a rock cell holding refractory lining draws the firebrick tile with its joints
 * glowing (`uHasHeatTiles`); until those maps load, a flat molten colour and a procedural brick.
 * Both glows are emissive, so they read in the dark of band 5.
 *
 * Rock and ore tiles draw their depth band's strata map once the five have loaded (S7d,
 * `uHasStrata`), wrapped around the planet in rings (`groundStrata.ts`): albedo for the colour,
 * tinted per planet, and the baked normal tilting the lamp and point lights toward the slopes that
 * face them. Until then, and on the pad, core and cache, the flat band colour shows.
 *
 * A gated cell (tickets 298, 299) carries the gate channel's bits (`cellGateBits.ts`) and draws its
 * marker as the cell's top layer, over the ore and its effects (#151 draw order: gate marker, grade
 * effects, theme overlay, ore base), in the planet's act tint (`uGateTint`). The patterns are the
 * kernel's catalogue (`gatePatterns.ts`): the hard rim, which glints once the local player's tip
 * major (`uGateTipMajor`) reaches the cell's opening major, the bare rim that is gone by then, the
 * cracked shell, and five slow surface motions, moving at constant brightness. With reduce motion
 * (`uGateStill`, the shake switch) time stops at one moment for the markers: a surface motion is
 * cut as its engraved glyph, a groove with a lit lip, and the rim's glint holds still. A kind with
 * no pattern yet draws the placeholder. A cell with no gate skips it all.
 */

export const TERRAIN_VERTEX_SHADER = /* glsl */ `
attribute vec2 aTile;
attribute vec3 aBase;
attribute vec4 aOre;
attribute vec4 aStyle;
attribute float aGate;

varying vec2 vLocal;
varying vec2 vChunk;
varying vec2 vWorld;
varying vec2 vTile;
varying vec3 vBase;
varying vec4 vOre;
varying vec4 vStyle;
varying float vGate;

void main() {
  vLocal = position.xy + 0.5;
  vChunk = position.xy + aTile + 0.5;
  vec4 world = modelMatrix * vec4(position.xy + aTile + 0.5, 0.0, 1.0);
  vWorld = world.xy;
  vTile = floor((modelMatrix * vec4(aTile + 0.5, 0.0, 1.0)).xy);
  vBase = aBase;
  vOre = aOre;
  vStyle = aStyle;
  vGate = aGate;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const TERRAIN_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uLampPosition;
uniform vec2 uLampDirection;
uniform float uLampCosHalfAngle;
uniform float uLampRange;
uniform float uLampSpill;
uniform vec3 uLampColour;
uniform float uPlanetRadius;
uniform float uAmbientSurface;
uniform float uAmbientDeep;
uniform float uAmbientFade;
uniform sampler2D uDensity;
// x, y and range in metres; colour premultiplied by strength.
uniform vec3 uPointLights[MAX_POINT_LIGHTS];
uniform vec3 uPointColours[MAX_POINT_LIGHTS];
uniform float uWhisper;
uniform float uWhisperRange;
uniform float uCacheLive;
// Ground strata (S7d), bands 1 to 5; band b starts where a tile's halfTileDistanceSq is at most
// uBandStarts[b - 2], as in bandOfTile (planetGeometry).
uniform float uHasStrata;
uniform sampler2D uStrataAlbedo[5];
uniform sampler2D uStrataNormal[5];
uniform vec3 uStrataTint[5];
uniform float uStrataTurns[5];
uniform float uStrataTileM;
uniform float uBandStarts[4];
// Heat planets (#113): the lava and refractory tiles, albedo and glow, each 4 m square.
uniform float uHasHeatTiles;
uniform sampler2D uLavaAlbedo;
uniform sampler2D uLavaEmissive;
uniform sampler2D uRefractoryAlbedo;
uniform sampler2D uRefractoryEmissive;
// The planet's act tint for gate markers (#151), never a per-cell bit (terrainGateTint.ts).
uniform vec3 uGateTint;
// The local player's drill tip major and reduce motion, 1 or 0 (terrainGateViewer.ts).
uniform float uGateTipMajor;
uniform float uGateStill;

varying vec2 vLocal;
varying vec2 vChunk;
varying vec2 vWorld;
varying vec2 vTile;
varying vec3 vBase;
varying vec4 vOre;
varying vec4 vStyle;
varying float vGate;

// sampleGrid: 4 samples per tile, a 129-sample halo, the contour at 128 of 255.
const float SAMPLES_PER_TILE = 4.0;
const float HALO_SIDE = 129.0;
const float ISO = 128.0 / 255.0;
const float EDGE_PIXELS = 2.0;
const float TAU = 6.28318530718;
// How far a baked slope brightens toward a light it faces, and darkens away from it.
const float RELIEF = 1.0;

// Hash without sine (Dave Hoskins, "Hash without Sine", MIT): stable on every GPU.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

mat2 rotation(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

// The sRGB transfer, inverted; above 1 it keeps rising, so bright glow still blooms.
vec3 displayToLinear(vec3 colour) {
  vec3 low = colour / 12.92;
  vec3 high = pow((colour + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), colour));
}

// The sRGB transfer: a strata map samples as linear light, the shader works in display values.
vec3 linearToDisplay(vec3 colour) {
  vec3 low = colour * 12.92;
  vec3 high = 1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), colour));
}

float densityAt(vec2 chunkLocal) {
  return texture2D(uDensity, (chunkLocal * SAMPLES_PER_TILE + 0.5) / HALO_SIDE).r;
}

// About EDGE_PIXELS wide on screen at any zoom: the density's change per pixel sets the band.
float edgeHighlight(float density) {
  float perPixel = max(fwidth(density), 0.0001);
  return 1.0 - smoothstep(EDGE_PIXELS * perPixel * 0.5, EDGE_PIXELS * perPixel, density - ISO);
}

// Metals: angular flecks and nuggets, a few turned squares per tile.
float flecks(vec2 local, vec2 tile) {
  float inside = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 seed = tile + float(i) * 17.31;
    vec2 centre = 0.22 + 0.56 * vec2(hash12(seed), hash12(seed + 5.7));
    vec2 q = rotation(hash12(seed + 9.1) * 1.57) * (local - centre);
    float size = 0.08 + 0.07 * hash12(seed + 3.3);
    inside = max(inside, step(max(abs(q.x), abs(q.y)), size));
  }
  return inside;
}

// Crystals: faceted shards, long diamonds with a lit and a shaded facet.
float shards(vec2 local, vec2 tile) {
  float facet = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 seed = tile + float(i) * 23.17;
    vec2 centre = 0.3 + 0.4 * vec2(hash12(seed), hash12(seed + 4.2));
    vec2 q = rotation(hash12(seed + 8.8) * 3.14) * (local - centre);
    float inside = step(abs(q.x) / 0.09 + abs(q.y) / 0.27, 1.0);
    facet = max(facet, inside * (q.x > 0.0 ? 1.0 : 0.65));
  }
  return facet;
}

float sparkles(vec2 local, vec2 tile, float count) {
  float light = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= count) break;
    vec2 seed = tile + float(i) * 31.7 + 2.0;
    vec2 q = abs(local - (0.15 + 0.7 * vec2(hash12(seed), hash12(seed + 1.9))));
    float star = max(step(q.x, 0.014) * step(q.y, 0.07), step(q.y, 0.014) * step(q.x, 0.07));
    float twinkle = pow(max(0.0, sin(uTime * 2.6 + hash12(seed + 7.0) * 6.28)), 6.0);
    light = max(light, star * twinkle);
  }
  return light;
}

// The heat tiles cover 4 m; lava creeps along its tile slowly.
const float HEAT_TILE_M = 4.0;
const vec3 MOLTEN = vec3(1.0, 0.42, 0.08);
const vec3 FIREBRICK = vec3(0.52, 0.16, 0.10);

// Brick courses 0.25 m high and 0.5 m long, every other course offset: 1 in a joint, 0 on brick.
float brickJoint(vec2 world) {
  vec2 brick = world / vec2(0.5, 0.25);
  brick.x += 0.5 * mod(floor(brick.y), 2.0);
  vec2 inBrick = fract(brick);
  return 1.0 - step(0.06, inBrick.x) * step(0.1, inBrick.y);
}

// The gate channel (cellGateBits.ts): the opening major above GATED_BIT, then state, then kind.
float gateKindOf(float bits) {
  return mod(bits, float(GATE_KIND_COUNT));
}

float gateStateOf(float bits) {
  return mod(floor(bits / float(GATE_KIND_COUNT)), float(GATE_STATE_COUNT));
}

bool isGatedCell(float bits) {
  return mod(floor(bits / float(GATED_BIT)), 2.0) > 0.5;
}

// 1 once the local player's tip major reaches the cell's opening major; a field of 0 never opens.
float gateOpenness(float bits) {
  float opening = floor(bits / float(GATE_OPENING_UNIT));
  return step(0.5, opening) * step(opening - 1.0, uGateTipMajor);
}

bool isGateKind(float kind, int pattern) {
  return abs(kind - float(pattern)) < 0.5;
}

// The near-black of a rim, a crack or a groove; the warm white of the rim's glint (#151).
const vec3 GATE_DARK = vec3(0.06, 0.05, 0.05);
const vec3 GATE_GLINT = vec3(1.0, 0.94, 0.78);
// The marker's lines glow this much in its tint, so a gate reads in the dark of band 5.
const float GATE_TINT_GLOW = 0.16;
// Reduce motion stops the markers here: the filings stand aligned, every pattern at rest.
const float GATE_STILL_TIME = 4.488;
// How far a line's shadow, or an engraved groove's lit lip, sits from the line, in tiles.
const float GATE_LIP = 0.035;
const float GATE_CLEARED_TRACE = 0.3;

// Soft lines across every whole x, width either side of it, soft the edge in the same units.
float gateLines(float x, float width, float soft) {
  float distance = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(width - soft, width + soft, distance);
}

// x: dark (the rim), y: none, z: the glint running round its inner edge once open.
vec3 hardRim(vec2 fromCentre, float edge, float time, float openness, float soft) {
  float rim = smoothstep(0.30 - soft, 0.38 + soft, edge);
  float innerEdge = smoothstep(0.26, 0.31, edge) * (1.0 - smoothstep(0.34, 0.40, edge));
  float around = atan(fromCentre.y, fromCentre.x);
  float glint = innerEdge * pow(max(0.0, cos(around - time * 1.1)), 10.0);
  return vec3(rim * (1.0 - 0.45 * openness), 0.0, glint * openness);
}

// Voronoi edges a few to the tile, seeded by the tile: the cracks of a sealed shell.
float shellCracks(vec2 local, vec2 tile, float soft) {
  vec2 grid = local * 2.6;
  vec2 cell = floor(grid);
  vec2 inCell = fract(grid);
  float nearest = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 seed = cell + offset + tile * 3.1;
      float distance = length(offset + vec2(hash12(seed), hash12(seed + 11.7)) - inCell);
      second = distance < nearest ? nearest : min(second, distance);
      nearest = min(nearest, distance);
    }
  }
  return 1.0 - smoothstep(0.04, 0.07 + soft * 2.6, second - nearest);
}

// x: the cracks and the shell's dark outer lip, y: the shell's plates in the tint.
vec3 crackedShell(vec2 local, float edge, float soft) {
  float shell = smoothstep(0.24, 0.32, edge);
  float lip = smoothstep(0.44, 0.48, edge);
  float cracks = shellCracks(local, vTile, soft);
  return vec3(max(cracks, lip), shell * (1.0 - cracks) * 0.6, 0.0);
}

bool isSurfaceMotion(float kind) {
  return isGateKind(kind, GATE_CONCENTRIC_RINGS) || isGateKind(kind, GATE_VAPOUR_WISPS) ||
    isGateKind(kind, GATE_DRIP_LINES) || isGateKind(kind, GATE_FILING_LINES) ||
    isGateKind(kind, GATE_RISING_RIPPLES);
}

// The line of each extractor's slow surface motion (#142's table), across and up the face.
float surfaceLines(float kind, vec2 fromCentre, vec2 up, float time, float soft) {
  vec2 face = vec2(dot(fromCentre, vec2(up.y, -up.x)), dot(fromCentre, up));
  if (isGateKind(kind, GATE_CONCENTRIC_RINGS)) {
    return gateLines(length(fromCentre) * 4.0 - time * 0.25, 0.09, soft * 4.0);
  }
  if (isGateKind(kind, GATE_VAPOUR_WISPS)) {
    float curl = 0.25 * sin(face.y * 9.0 - time * 0.9);
    float rising = smoothstep(0.15, 0.6, fract(face.y * 1.5 - time * 0.12));
    return gateLines(face.x * 3.0 + curl, 0.09, soft * 3.0) * rising;
  }
  if (isGateKind(kind, GATE_DRIP_LINES)) {
    float column = floor(face.x * 3.0 + 0.5);
    float falling = fract(face.y * 1.2 + time * 0.1 + column * 0.37);
    return gateLines(face.x * 3.0, 0.07, soft * 3.0) * (1.0 - smoothstep(0.5, 0.62, falling));
  }
  if (isGateKind(kind, GATE_FILING_LINES)) {
    vec2 grid = (fromCentre + 0.5) * 4.0;
    vec2 filing = fract(grid) - 0.5;
    float scattered = (hash12(floor(grid) + vTile * 5.3) - 0.5) * 3.14159265;
    float aligned = atan(up.y, up.x);
    float angle = mix(scattered, aligned, 0.5 + 0.5 * sin(time * 0.35));
    vec2 along = rotation(angle) * filing;
    float thin = 1.0 - smoothstep(0.05, 0.05 + soft * 4.0, abs(along.y));
    return thin * (1.0 - smoothstep(0.3, 0.3 + soft * 4.0, abs(along.x)));
  }
  // GATE_RISING_RIPPLES
  return gateLines(face.y * 3.5 + 0.06 * sin(face.x * 10.0) - time * 0.2, 0.08, soft * 3.5);
}

// x: a thin dark frame and the lines' shadow, or the glyph's groove; y: the lines, or its lip.
vec3 surfaceMotion(float kind, vec2 fromCentre, float edge, vec2 up, float time, float soft) {
  float inside = 1.0 - smoothstep(0.40, 0.44, edge);
  float frame = 0.8 * smoothstep(0.44, 0.48, edge);
  float line = surfaceLines(kind, fromCentre, up, time, soft) * inside;
  float beside = surfaceLines(kind, fromCentre - up * GATE_LIP, up, time, soft) * inside;
  vec2 moving = vec2(max(frame, 0.7 * beside * (1.0 - line)), line);
  vec2 engraved = vec2(max(frame, 0.85 * line), beside * (1.0 - line));
  return vec3(mix(moving, engraved, uGateStill), 0.0);
}

// #298's placeholder, for a kind with no pattern yet: a dark rim and stripes turned by kind.
vec3 placeholderMarker(vec2 fromCentre, float edge, float kind) {
  float rim = smoothstep(0.36, 0.46, edge);
  vec2 turned = rotation(kind * 3.14159265 / float(GATE_KIND_COUNT)) * fromCentre;
  return vec3(rim, step(0.72, fract(turned.x * 4.0 + 0.5)) * (1.0 - rim), 0.0);
}

vec3 gatePatternOf(float kind, vec2 local, vec2 up, float openness, float soft) {
  vec2 fromCentre = local - 0.5;
  float edge = max(abs(fromCentre.x), abs(fromCentre.y));
  float time = mix(uTime, GATE_STILL_TIME, uGateStill);
  if (isGateKind(kind, GATE_HARD_RIM) || isGateKind(kind, GATE_BARE_RIM)) {
    return hardRim(fromCentre, edge, time, openness, soft);
  }
  if (isGateKind(kind, GATE_CRACKED_SHELL)) return crackedShell(local, edge, soft);
  if (isSurfaceMotion(kind)) return surfaceMotion(kind, fromCentre, edge, up, time, soft);
  return placeholderMarker(fromCentre, edge, kind);
}

// Revealed lights an inner edge in the tint, cleared leaves a faint trace; others draw locked.
vec3 gateMarkerInState(vec3 marker, float state, vec2 local) {
  vec2 fromCentre = local - 0.5;
  float edge = max(abs(fromCentre.x), abs(fromCentre.y));
  float revealed = 1.0 - smoothstep(0.015, 0.035, abs(edge - 0.41));
  if (abs(state - float(GATE_STATE_REVEALED)) < 0.5) marker.y = max(marker.y, revealed);
  if (abs(state - float(GATE_STATE_CLEARED)) < 0.5) marker *= GATE_CLEARED_TRACE;
  return marker;
}

// A bare rim is gone once open; every other marker draws, the hard rim glinting.
bool isGateDrawn(float kind, float openness) {
  return !(isGateKind(kind, GATE_BARE_RIM) && openness > 0.5);
}

// The tile's depth band by the integer rule of bandOfTile: exact below 2^24, so for any planet.
int bandOfTile(vec2 tile) {
  vec2 halfTile = 2.0 * tile + 1.0;
  float distanceSq = dot(halfTile, halfTile);
  int band = 1;
  for (int i = 0; i < 4; i++) band += int(step(distanceSq, uBandStarts[i]));
  return band;
}

// Ring coordinates in strata tiles: u runs clockwise along the band and v outward, so the map's
// right and up are the ground's wherever the camera rolls (the maps upload unflipped, v down).
vec2 strataUv(vec2 world, float turns) {
  return vec2(-atan(world.y, world.x) / TAU * turns, -length(world) / uStrataTileM);
}

// The change of strataUv for a change of world position: continuous across atan's wrap, so the
// mip level never jumps there.
vec2 strataUvChange(vec2 world, vec2 change, float turns) {
  float radius = length(world);
  float turn = (world.x * change.y - world.y * change.x) / (radius * radius);
  return vec2(-turn / TAU * turns, -dot(world, change) / radius / uStrataTileM);
}

// Explicit gradients, because the band differs per tile and sampler arrays take constant indices.
vec4 strataAlbedo(int band, vec2 uv, vec2 dx, vec2 dy) {
  if (band == 1) return textureGrad(uStrataAlbedo[0], uv, dx, dy);
  if (band == 2) return textureGrad(uStrataAlbedo[1], uv, dx, dy);
  if (band == 3) return textureGrad(uStrataAlbedo[2], uv, dx, dy);
  if (band == 4) return textureGrad(uStrataAlbedo[3], uv, dx, dy);
  return textureGrad(uStrataAlbedo[4], uv, dx, dy);
}

vec4 strataNormal(int band, vec2 uv, vec2 dx, vec2 dy) {
  if (band == 1) return textureGrad(uStrataNormal[0], uv, dx, dy);
  if (band == 2) return textureGrad(uStrataNormal[1], uv, dx, dy);
  if (band == 3) return textureGrad(uStrataNormal[2], uv, dx, dy);
  if (band == 4) return textureGrad(uStrataNormal[3], uv, dx, dy);
  return textureGrad(uStrataNormal[4], uv, dx, dy);
}

// A tangent-space normal (OpenGL, +Y up) in world terms: its x along the band, its y outward.
vec3 groundNormalOf(vec3 tangentNormal, vec2 world) {
  vec2 outward = normalize(world);
  vec2 along = vec2(outward.y, -outward.x);
  return normalize(vec3(tangentNormal.x * along + tangentNormal.y * outward, tangentNormal.z));
}

// 1 on flat ground; a slope facing the light at from is brighter, one turned away darker.
float reliefToward(vec2 from, vec2 world, vec3 normal) {
  vec2 toLight = from - world;
  return max(0.0, 1.0 + RELIEF * dot(normal.xy, toLight / max(length(toLight), 0.0001)));
}

vec3 lightAt(vec2 world, vec3 normal) {
  float depth = uPlanetRadius - length(world);
  float ambient = mix(uAmbientSurface, uAmbientDeep, clamp(depth / uAmbientFade, 0.0, 1.0));
  vec2 toPoint = world - uLampPosition;
  float distance = length(toPoint);
  float along = dot(toPoint / max(distance, 0.0001), uLampDirection);
  float cone = smoothstep(uLampCosHalfAngle, mix(uLampCosHalfAngle, 1.0, 0.35), along);
  float reach = 1.0 - smoothstep(uLampRange * 0.35, uLampRange, distance);
  float spill = 1.0 - smoothstep(0.0, uLampSpill, distance);
  vec3 points = vec3(0.0);
  for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
    float falloff = 1.0 - smoothstep(0.0, uPointLights[i].z, length(world - uPointLights[i].xy));
    points += uPointColours[i] * falloff * falloff * reliefToward(uPointLights[i].xy, world, normal);
  }
  vec3 lamp = uLampColour * (cone * reach + 0.6 * spill) * reliefToward(uLampPosition, world, normal);
  return vec3(ambient * normal.z) + lamp + points;
}

void main() {
  float density = densityAt(vChunk);
  if (density < ISO) discard;
  float style = vStyle.x;
  vec3 colour = vBase * (0.94 + 0.08 * hash12(floor(vLocal * 6.0) + vTile * 7.0));
  vec3 normal = vec3(0.0, 0.0, 1.0);
  // Derivatives outside the branch: a pixel's neighbours may be in a tile that skips it.
  vec2 worldDx = dFdx(vWorld);
  vec2 worldDy = dFdy(vWorld);
  // A gate marker's edges, about a pixel soft at any zoom, in tiles.
  float gateSoft = clamp(fwidth(vLocal.x), 0.004, 0.05);
  if (uHasStrata > 0.5 && style < 1.5) {
    int band = bandOfTile(vTile);
    float turns = uStrataTurns[band - 1];
    vec2 uv = strataUv(vWorld, turns);
    vec2 dx = strataUvChange(vWorld, worldDx, turns);
    vec2 dy = strataUvChange(vWorld, worldDy, turns);
    colour = linearToDisplay(strataAlbedo(band, uv, dx, dy).rgb) * uStrataTint[band - 1];
    normal = groundNormalOf(strataNormal(band, uv, dx, dy).xyz * 2.0 - 1.0, vWorld);
  }
  if (style < 0.5 && vStyle.y > 0.5) {
    // Refractory lining (#113): firebrick, its joints glowing.
    vec2 uv = vWorld / HEAT_TILE_M;
    colour = uHasHeatTiles > 0.5
      ? linearToDisplay(texture2D(uRefractoryAlbedo, uv).rgb)
      : FIREBRICK * (0.85 + 0.15 * hash12(floor(vWorld / vec2(0.5, 0.25))));
  }
  colour = mix(colour, colour * 1.5 + vec3(0.06, 0.05, 0.03), 0.55 * edgeHighlight(density));
  vec3 light = lightAt(vWorld, normal);
  vec3 emissive = vec3(0.0);
  float ember = 0.75 + 0.25 * sin(uTime * 1.3 + length(vWorld) * 0.6);
  if (style < 0.5 && vStyle.y > 0.5) {
    vec2 uv = vWorld / HEAT_TILE_M;
    vec3 seams = uHasHeatTiles > 0.5
      ? linearToDisplay(texture2D(uRefractoryEmissive, uv).rgb)
      : MOLTEN * 0.6 * brickJoint(vWorld);
    emissive += seams * ember;
  }

  if (style > 4.5) {
    // Lava (#113): crust plates on molten rock, the cracks glowing, creeping and pulsing.
    vec2 uv = vWorld / HEAT_TILE_M + vec2(uTime * 0.015, 0.0);
    vec3 glow = uHasHeatTiles > 0.5
      ? linearToDisplay(texture2D(uLavaEmissive, uv).rgb)
      : MOLTEN * (0.55 + 0.45 * hash12(floor(vWorld * 3.0) + floor(uTime * 0.5)));
    colour = uHasHeatTiles > 0.5 ? linearToDisplay(texture2D(uLavaAlbedo, uv).rgb) : vBase * 0.35;
    emissive += glow * (0.8 + 0.2 * sin(uTime * 2.1 + length(vWorld) * 0.9));
  } else if (style > 3.5) {
    // The artefact cache: a banded casket with a rune ring, live or a dull husk.
    vec2 fromCentre = vLocal - 0.5;
    float ring = 1.0 - step(0.035, abs(length(fromCentre) - 0.28));
    float band = 1.0 - step(0.05, abs(fromCentre.y));
    colour *= mix(0.4, 1.0, uCacheLive) * (1.0 + 0.25 * band);
    emissive += vec3(1.0, 0.78, 0.38) * ring * uCacheLive * (0.55 + 0.35 * sin(uTime * 2.2));
  } else if (style > 2.5) {
    // The dock pad: riveted plate, lit like the platform.
    vec2 fromCentre = abs(vLocal - 0.5);
    colour *= 1.0 + 0.35 * step(length(fromCentre - 0.36), 0.05);
    colour *= 0.9 + 0.1 * step(max(fromCentre.x, fromCentre.y), 0.46);
    light = max(light, vec3(uAmbientSurface));
  } else if (style > 1.5) {
    // The core: a slow emissive pulse rippling out from the centre.
    emissive += colour * 0.6 * (0.55 + 0.25 * sin(uTime * 1.7 - length(vWorld) * 0.8));
  } else if (style > 0.5) {
    float shape = vStyle.z < 1.5 ? flecks(vLocal, vTile) : shards(vLocal, vTile);
    colour = mix(colour, vOre.rgb * max(shape, 0.65), step(0.01, shape));
    float halo = 1.0 - smoothstep(0.0, 0.7, length(vLocal - 0.5));
    emissive += vOre.rgb * vOre.a * (0.35 * shape + 0.2 * halo);
    emissive += vec3(1.0, 0.97, 0.9) * sparkles(vLocal, vTile, vStyle.w);
    // ore_whisper: the tile's rim, within range of the vehicle and near the tunnel.
    float inRange = 1.0 - smoothstep(uWhisperRange - 2.0, uWhisperRange, distance(vWorld, uLampPosition));
    float rim = smoothstep(0.34, 0.5, max(abs(vLocal.x - 0.5), abs(vLocal.y - 0.5)));
    emissive += vOre.rgb * uWhisper * vStyle.y * inRange * rim * (0.75 + 0.25 * sin(uTime * 3.0));
  }

  float gateBits = floor(vGate + 0.5);
  float gateKind = gateKindOf(gateBits);
  float gateOpen = gateOpenness(gateBits);
  if (isGatedCell(gateBits) && isGateDrawn(gateKind, gateOpen)) {
    // The top layer: it covers the ore and its glow beneath it.
    vec3 marker = gatePatternOf(gateKind, vLocal, normalize(vWorld), gateOpen, gateSoft);
    marker = gateMarkerInState(marker, gateStateOf(gateBits), vLocal);
    colour = mix(colour, GATE_DARK, marker.x);
    colour = mix(colour, uGateTint, marker.y);
    colour = mix(colour, GATE_GLINT, marker.z);
    emissive *= 1.0 - max(marker.x, max(marker.y, marker.z));
    emissive += uGateTint * GATE_TINT_GLOW * marker.y + GATE_GLINT * marker.z;
  }

  gl_FragColor = vec4(displayToLinear(colour * light + emissive), 1.0);
}
`
