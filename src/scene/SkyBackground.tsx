/**
 * The background behind the tiles (#13 Parallax and background): the planet palette's sky at the
 * surface, fading to the underground dark as the vehicle goes down. Recoloured only when the
 * vehicle's depth crosses a whole tile, so most frames do nothing.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color } from 'three'
import { readPlanetWorld } from '../store/gameStore'
import { paletteOf, skyColourAt } from '../systems/render/bandPalette'
import type { PlanetParams } from '../systems/world/planetParams'
import { vehiclePresence } from './vehiclePresence'

export function SkyBackground() {
  const scene = useThree((state) => state.scene)
  const sky = useMemo(() => new Color(), [])
  const shown = useRef<ShownSky>({ depth: Number.NaN, paletteId: '' })

  useEffect(() => {
    scene.background = sky
    return () => {
      scene.background = null
    }
  }, [scene, sky])

  useFrame(() => {
    const { params } = readPlanetWorld()
    if (params !== null) recolourOnNewDepth(sky, shown.current, params)
  })

  return null
}

interface ShownSky {
  depth: number
  paletteId: string
}

function recolourOnNewDepth(sky: Color, shown: ShownSky, params: PlanetParams): void {
  const depth = Math.floor(params.radiusTiles - Math.hypot(vehiclePresence.x, vehiclePresence.y))
  if (depth === shown.depth && params.paletteId === shown.paletteId) return
  shown.depth = depth
  shown.paletteId = params.paletteId
  // Display values, as the terrain shader writes them; setRGB alone would read them as linear.
  sky.setRGB(...skyColourAt(paletteOf(params.paletteId), depth)).convertSRGBToLinear()
}
