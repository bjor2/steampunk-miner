/**
 * Which point lights shine this frame (#38 "Lights": the headlamp plus at most 4 dynamic point
 * lights in view; #48: bay lights are 2 of those 4). Every light source in the world is listed,
 * and the nearest 4 whose light reaches the view circle are kept. Written into a caller's list,
 * because it runs every frame. The ambient light that fades with depth (#13) is here too, so the
 * lit parts and the terrain shader agree on how dark it is.
 */
import {
  AMBIENT_DEEP,
  AMBIENT_FADE_DEPTH_TILES,
  AMBIENT_SURFACE,
  DRILL_SPARK_LIGHT,
  MAX_POINT_LIGHTS,
} from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import type { PlatformLamp } from './platformPlaceholder'

export interface PointLightSource {
  id: string
  x: number
  y: number
  colour: string
  rangeM: number
  /** Share of full light at the centre, 0 to 1. */
  strength: number
}

/** The nearest `MAX_POINT_LIGHTS` sources whose light reaches the view, nearest first. */
export function choosePointLights(
  sources: readonly PointLightSource[],
  centre: Vector2,
  viewRadius: number,
  chosen: PointLightSource[],
): void {
  chosen.length = 0
  for (const source of sources) {
    if (reachesView(source, centre, viewRadius)) insertByDistance(chosen, source, centre)
  }
  if (chosen.length > MAX_POINT_LIGHTS) chosen.length = MAX_POINT_LIGHTS
}

function reachesView(source: PointLightSource, centre: Vector2, viewRadius: number): boolean {
  return distanceTo(source, centre) <= viewRadius + source.rangeM
}

function insertByDistance(chosen: PointLightSource[], source: PointLightSource, centre: Vector2) {
  const distance = distanceTo(source, centre)
  let at = chosen.length
  while (at > 0 && distanceTo(chosen[at - 1], centre) > distance) at--
  chosen.splice(at, 0, source)
}

function distanceTo(source: PointLightSource, point: Vector2): number {
  return Math.hypot(source.x - point.x, source.y - point.y)
}

/** The drill's spark light, moved onto the drill's nose while it bites. */
export function createDrillSparkLight(): PointLightSource {
  return { id: 'drill-sparks', x: 0, y: 0, ...DRILL_SPARK_LIGHT }
}

/** The ambient share at a depth below the surface: full at the surface, fading to the deep dark. */
export function ambientAtDepth(depthTiles: number): number {
  const fade = Math.min(Math.max(depthTiles / AMBIENT_FADE_DEPTH_TILES, 0), 1)
  return AMBIENT_SURFACE + (AMBIENT_DEEP - AMBIENT_SURFACE) * fade
}

/** The platform's lamps in world metres; the platform stands upright on its pad. */
export function platformLightsOf(
  origin: Vector2,
  lamps: readonly PlatformLamp[],
): PointLightSource[] {
  return lamps.map(({ offset, ...lamp }) => ({
    ...lamp,
    x: origin.x + offset[0],
    y: origin.y + offset[1],
  }))
}
