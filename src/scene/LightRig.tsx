/**
 * The scene's lights (#38 "Lights", #48 "lit brass machinery in a dark, carved world"): an ambient
 * light that fades with depth like the terrain's, the headlamp's light on the vehicle's own parts,
 * and a fixed pool of 4 point lights given to the nearest light sources in view (platform lamps,
 * the drill's sparks). The pool never grows or shrinks, so the lit materials never recompile; an
 * unused light is dark. The terrain shader reads the same choice through `lightPresence`.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, type AmbientLight, type PointLight } from 'three'
import { HEADLAMP_BODY_LIGHT, HEADLAMP_COLOUR, MAX_POINT_LIGHTS } from '../constants/scene'
import { readPlanetWorld, useGameStore } from '../store/gameStore'
import { platformLookOf, platformOriginOf } from '../systems/render/platformPlaceholder'
import {
  ambientAtDepth,
  choosePointLights,
  createDrillSparkLight,
  platformLightsOf,
  type PointLightSource,
} from '../systems/render/sceneLights'
import { viewRadiusOf } from '../systems/render/visibleChunks'
import { pixelsPerMetreOf } from '../systems/render/viewZoom'
import { dockSiteOf } from '../systems/world/dockSite'
import { cameraPresence } from './cameraPresence'
import { drillPresence } from './drillPresence'
import { lightPresence } from './lightPresence'
import { vehiclePresence } from './vehiclePresence'

const POOL = Array.from({ length: MAX_POINT_LIGHTS }, (_, at) => at)

export function LightRig() {
  const platformLights = usePlatformLights()
  const rig = useMemo(createRigScratch, [])
  const ambient = useRef<AmbientLight>(null)
  const headlamp = useRef<PointLight>(null)
  const pool = useRef<(PointLight | null)[]>([])
  useFrame(() => {
    gatherSources(rig, platformLights)
    choosePointLights(rig.sources, vehiclePresence, viewRadiusOnScreen(), lightPresence.pointLights)
    dimAmbientWithDepth(ambient.current)
    followVehicle(headlamp.current)
    writePool(pool.current, lightPresence.pointLights, rig.colour)
  })
  return (
    <>
      <ambientLight ref={ambient} intensity={Math.PI} />
      <pointLight
        ref={headlamp}
        color={HEADLAMP_COLOUR}
        intensity={intensityOf(HEADLAMP_BODY_LIGHT.strength)}
        distance={HEADLAMP_BODY_LIGHT.rangeM}
      />
      {POOL.map((at) => (
        <pointLight
          key={at}
          ref={(light) => {
            pool.current[at] = light
          }}
          intensity={0}
        />
      ))}
    </>
  )
}

interface RigScratch {
  sources: PointLightSource[]
  drill: PointLightSource
  colour: Color
}

function createRigScratch(): RigScratch {
  return { sources: [], drill: createDrillSparkLight(), colour: new Color() }
}

/** The platform's lamps move only with the planet or its visual state; never per frame. */
function usePlatformLights(): PointLightSource[] {
  // The planet's seed re-renders this on travel or a new seed, where the pad moves.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const visualState = useGameStore((state) => state.platform.visualState)
  const { params } = readPlanetWorld()
  if (params === null) return []
  const site = dockSiteOf(params)
  const origin = platformOriginOf(site)
  return platformLightsOf(origin, platformLookOf(visualState, site).lamps)
}

function gatherSources(rig: RigScratch, platformLights: readonly PointLightSource[]): void {
  rig.sources.length = 0
  for (const light of platformLights) rig.sources.push(light)
  if (!drillPresence.isDrilling) return
  rig.drill.x = drillPresence.nose.x
  rig.drill.y = drillPresence.nose.y
  rig.sources.push(rig.drill)
}

function viewRadiusOnScreen(): number {
  const { widthPixels, heightPixels, viewShortAxisMetres } = cameraPresence
  const zoom = pixelsPerMetreOf(widthPixels, heightPixels, viewShortAxisMetres)
  return viewRadiusOf(widthPixels, heightPixels, zoom)
}

/** `PI x share` reflects `share` of an albedo from a Lambert surface (three's physical lights). */
function dimAmbientWithDepth(ambient: AmbientLight | null): void {
  const { params } = readPlanetWorld()
  if (ambient === null || params === null) return
  const depth = params.radiusTiles - Math.hypot(vehiclePresence.x, vehiclePresence.y)
  ambient.intensity = Math.PI * ambientAtDepth(depth)
}

function followVehicle(headlamp: PointLight | null): void {
  headlamp?.position.set(vehiclePresence.x, vehiclePresence.y, HEADLAMP_BODY_LIGHT.heightM)
}

function writePool(pool: (PointLight | null)[], chosen: PointLightSource[], colour: Color): void {
  for (const at of POOL) {
    const light = pool[at]
    if (light === null || light === undefined) continue
    const source = chosen[at]
    light.intensity = source === undefined ? 0 : intensityOf(source.strength)
    if (source === undefined) continue
    light.position.set(source.x, source.y, HEADLAMP_BODY_LIGHT.heightM)
    light.distance = source.rangeM
    light.color.copy(colour.set(source.colour))
  }
}

/**
 * three's lights are physical since r155: a Lambert surface facing a light `h` metres in front
 * of it receives `intensity / h^2`, and reflects `1/PI` of it, so this gives `strength` of full
 * light at the source's centre.
 */
function intensityOf(strength: number): number {
  return strength * Math.PI * HEADLAMP_BODY_LIGHT.heightM * HEADLAMP_BODY_LIGHT.heightM
}
