/**
 * The terrain's one shader (#13 Visual direction, #22): every chunk mesh draws with it, so a
 * chunk is one draw call with its edge highlight, noise texture, ore decal, ore glow, sparkles and
 * lighting all in it. Instance attributes come from `buildChunkTileBatch`; style and silhouette
 * codes are the ones it exports. Each quad is cut along the ground's surface (#36): the chunk's
 * density halo is a texture, blended bilinearly between samples, and a fragment below 128 is air.
 * The edge highlight is the band just inside that contour. Colours are display (sRGB) values written as is,
 * the flat look of #13 with no tone mapping.
 *
 * Lighting is the vehicle lamp, ambient light that fades with depth, and the scene's point lights
 * (#13, #38: the lamp plus at most 4 point lights; `LightRig` chooses them, an unused one is black). Ore glow, sparkles and the core's pulse are emissive, so
 * ore stays readable in the dark and by shape and brightness, not colour alone.
 */

export const TERRAIN_VERTEX_SHADER = /* glsl */ `
attribute vec2 aTile;
attribute vec3 aBase;
attribute vec4 aOre;
attribute vec4 aStyle;

varying vec2 vLocal;
varying vec2 vChunk;
varying vec2 vWorld;
varying vec2 vTile;
varying vec3 vBase;
varying vec4 vOre;
varying vec4 vStyle;

void main() {
  vLocal = position.xy + 0.5;
  vChunk = position.xy + aTile + 0.5;
  vec4 world = modelMatrix * vec4(position.xy + aTile + 0.5, 0.0, 1.0);
  vWorld = world.xy;
  vTile = floor((modelMatrix * vec4(aTile + 0.5, 0.0, 1.0)).xy);
  vBase = aBase;
  vOre = aOre;
  vStyle = aStyle;
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

varying vec2 vLocal;
varying vec2 vChunk;
varying vec2 vWorld;
varying vec2 vTile;
varying vec3 vBase;
varying vec4 vOre;
varying vec4 vStyle;

// sampleGrid: 4 samples per tile, a 129-sample halo, the contour at 128 of 255.
const float SAMPLES_PER_TILE = 4.0;
const float HALO_SIDE = 129.0;
const float ISO = 128.0 / 255.0;
const float EDGE_PIXELS = 2.0;

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

vec3 lightAt(vec2 world) {
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
    points += uPointColours[i] * falloff * falloff;
  }
  return vec3(ambient) + uLampColour * (cone * reach + 0.6 * spill) + points;
}

void main() {
  float density = densityAt(vChunk);
  if (density < ISO) discard;
  float style = vStyle.x;
  vec3 colour = vBase * (0.94 + 0.08 * hash12(floor(vLocal * 6.0) + vTile * 7.0));
  colour = mix(colour, colour * 1.5 + vec3(0.06, 0.05, 0.03), 0.55 * edgeHighlight(density));
  vec3 light = lightAt(vWorld);
  vec3 emissive = vec3(0.0);

  if (style > 2.5) {
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
  }

  gl_FragColor = vec4(colour * light + emissive, 1.0);
}
`
