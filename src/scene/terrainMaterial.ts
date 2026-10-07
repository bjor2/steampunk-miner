/**
 * The shared terrain material: one ShaderMaterial for every chunk mesh, so the lamp and the clock
 * are set once per frame for the whole planet. Uniform values are updated in place; nothing here
 * allocates per frame.
 */
import { ShaderMaterial, Vector2 as ThreeVector2, Vector3 } from 'three'
import {
  AMBIENT_DEEP,
  AMBIENT_FADE_DEPTH_TILES,
  AMBIENT_SURFACE,
  HEADLAMP_COLOUR,
  HEADLAMP_HALF_ANGLE_RADIANS,
  HEADLAMP_RANGE_TILES,
  HEADLAMP_SPILL_TILES,
  MAX_POINT_LIGHTS,
  ORE_WHISPER_RANGE_TILES,
} from '../constants/scene'
import {
  GATED_BIT,
  GATE_OPENING_UNIT,
  GATE_STATE,
  MAX_GATE_KIND,
  MAX_GATE_STATE,
} from '../systems/render/cellGateBits'
import { gatePatternDefines } from '../systems/render/gatePatterns'
import { rgbOfHex, type Rgb } from '../systems/render/colour'
import { writeHeadlampDirection } from '../systems/render/headlamp'
import type { ArtefactLook } from '../systems/render/artefactLook'
import type { PointLightSource } from '../systems/render/sceneLights'
import type { Facing } from '../systems/vehicle/vehiclePose'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from './terrainShader'
import { createGateTintUniforms } from './terrainGateTint'
import { createGateViewerUniforms } from './terrainGateViewer'
import { createHeatTileUniforms } from './terrainHeatTiles'
import { createStrataUniforms } from './terrainStrata'

/** What lights the terrain this frame. */
export interface TerrainLight extends ArtefactLook {
  lampPosition: Vector2
  vehicleUp: Vector2
  facing: Facing
  planetRadiusTiles: number
  dt: number
  /** At most `MAX_POINT_LIGHTS`, chosen by `LightRig`. */
  pointLights: readonly PointLightSource[]
}

export function createTerrainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    defines: {
      MAX_POINT_LIGHTS,
      // The gate channel's layout (cellGateBits.ts), so the shader decodes what the mesher wrote.
      GATED_BIT,
      GATE_KIND_COUNT: MAX_GATE_KIND + 1,
      GATE_STATE_COUNT: MAX_GATE_STATE + 1,
      GATE_OPENING_UNIT,
      GATE_STATE_REVEALED: GATE_STATE.revealed,
      GATE_STATE_CLEARED: GATE_STATE.cleared,
      // The pattern catalogue (gatePatterns.ts), so the shader names the kind it draws.
      ...gatePatternDefines(),
    },
    vertexShader: TERRAIN_VERTEX_SHADER,
    fragmentShader: TERRAIN_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uLampPosition: { value: new ThreeVector2() },
      uLampDirection: { value: new ThreeVector2(1, 0) },
      uLampCosHalfAngle: { value: Math.cos(HEADLAMP_HALF_ANGLE_RADIANS) },
      uLampRange: { value: HEADLAMP_RANGE_TILES },
      uLampSpill: { value: HEADLAMP_SPILL_TILES },
      // A display colour, as the shader writes it; three's Color would convert it to linear.
      uLampColour: { value: new Vector3(...rgbOfHex(HEADLAMP_COLOUR)) },
      uPlanetRadius: { value: 0 },
      uAmbientSurface: { value: AMBIENT_SURFACE },
      uAmbientDeep: { value: AMBIENT_DEEP },
      uAmbientFade: { value: AMBIENT_FADE_DEPTH_TILES },
      // Each chunk mesh sets its own density halo just before it draws (chunkMeshPool).
      uDensity: { value: null },
      uPointLights: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new Vector3()) },
      uPointColours: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new Vector3()) },
      uWhisper: { value: 0 },
      uWhisperRange: { value: ORE_WHISPER_RANGE_TILES },
      uCacheLive: { value: 1 },
      ...createStrataUniforms(),
      ...createHeatTileUniforms(),
      ...createGateTintUniforms(),
      ...createGateViewerUniforms(),
    },
  })
}

export function lightTerrain(material: ShaderMaterial, light: TerrainLight): void {
  const { uniforms } = material
  uniforms.uTime.value += light.dt
  uniforms.uLampPosition.value.set(light.lampPosition.x, light.lampPosition.y)
  writeHeadlampDirection(light.vehicleUp, light.facing, uniforms.uLampDirection.value)
  uniforms.uPlanetRadius.value = light.planetRadiusTiles
  writePointLights(uniforms.uPointLights.value, uniforms.uPointColours.value, light.pointLights)
  uniforms.uWhisper.value = light.isOreWhispering ? 1 : 0
  uniforms.uCacheLive.value = light.isCacheLive ? 1 : 0
}

/** Display colours like the lamp's; an unused slot is black, so it adds nothing. */
function writePointLights(
  positions: Vector3[],
  colours: Vector3[],
  lights: readonly PointLightSource[],
): void {
  for (let at = 0; at < MAX_POINT_LIGHTS; at++) {
    const light = lights[at]
    if (light === undefined) {
      colours[at].set(0, 0, 0)
      continue
    }
    positions[at].set(light.x, light.y, light.rangeM)
    const [red, green, blue] = cachedRgbOf(light.colour)
    colours[at].set(red, green, blue).multiplyScalar(light.strength)
  }
}

/** Light colours are a handful of constants: parsed once, so a frame allocates nothing. */
const PARSED_COLOURS = new Map<string, Rgb>()

function cachedRgbOf(hex: string): Rgb {
  const known = PARSED_COLOURS.get(hex)
  if (known !== undefined) return known
  const parsed = rgbOfHex(hex)
  PARSED_COLOURS.set(hex, parsed)
  return parsed
}
