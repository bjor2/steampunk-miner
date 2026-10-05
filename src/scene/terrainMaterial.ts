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
} from '../constants/scene'
import { rgbOfHex } from '../systems/render/colour'
import { writeHeadlampDirection } from '../systems/render/headlamp'
import type { Facing } from '../systems/vehicle/vehiclePose'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from './terrainShader'

/** What lights the terrain this frame. */
export interface TerrainLight {
  lampPosition: Vector2
  vehicleUp: Vector2
  facing: Facing
  planetRadiusTiles: number
  dt: number
}

export function createTerrainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
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
    },
  })
}

export function lightTerrain(material: ShaderMaterial, light: TerrainLight): void {
  const { uniforms } = material
  uniforms.uTime.value += light.dt
  uniforms.uLampPosition.value.set(light.lampPosition.x, light.lampPosition.y)
  writeHeadlampDirection(light.vehicleUp, light.facing, uniforms.uLampDirection.value)
  uniforms.uPlanetRadius.value = light.planetRadiusTiles
}
