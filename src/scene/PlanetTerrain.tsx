/**
 * The planet's tiles: the chunk meshes under the camera, lit by the vehicle's headlamp. Per-frame
 * work stays out of React: the pool and the material are created once and updated in `useFrame`.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, OrthographicCamera } from 'three'
import { writeArtefactLook } from '../store/artefactActions'
import { readPlanetWorld, useGameStore } from '../store/gameStore'
import { viewRadiusOf } from '../systems/render/visibleChunks'
import { planetParamsFor } from '../systems/world/planetParams'
import { EMPTY_WORLD } from '../systems/world/worldState'
import { createChunkMeshPool, type ChunkMeshPool, type TerrainView } from './chunkMeshPool'
import { drillPresence } from './drillPresence'
import { lightPresence } from './lightPresence'
import { renderPresence } from './renderPresence'
import { GroundStrata } from './GroundStrata'
import { HeatTiles } from './HeatTiles'
import { isHeatPlanet } from '../systems/economy/heatEconomy'
import { createTerrainMaterial, lightTerrain, type TerrainLight } from './terrainMaterial'
import { fitGateTintToPlanet } from './terrainGateTint'
import { fitStrataToPlanet } from './terrainStrata'
import { vehiclePresence } from './vehiclePresence'

export function PlanetTerrain() {
  const group = useRef<Group>(null)
  const pool = useRef<ChunkMeshPool | null>(null)
  const material = useMemo(createTerrainMaterial, [])
  // Reused every frame, so the frame loop allocates nothing.
  const view = useMemo(createTerrainViewScratch, [])
  const light = useMemo(createTerrainLightScratch, [])
  const isHeatPlanetNow = useGameStore((state) => isHeatPlanet(state.planetTier))

  useEffect(() => {
    if (group.current === null) return
    const created = createChunkMeshPool(group.current, material)
    pool.current = created
    return () => {
      created.dispose()
      material.dispose()
    }
  }, [material])

  useFrame(({ size, camera }, delta) => {
    const { params, world } = readPlanetWorld()
    if (pool.current === null || params === null) return
    view.params = params
    view.world = world
    view.viewRadius = viewRadiusOf(size.width, size.height, (camera as OrthographicCamera).zoom)
    syncTimed(pool.current, view)
    recordGroundDrawn(pool.current)
    light.facing = drillPresence.facing
    light.planetRadiusTiles = params.radiusTiles
    light.dt = delta
    writeArtefactLook(light, useGameStore.getState().playerId)
    lightTerrain(material, light)
    fitStrataToPlanet(material, params)
    fitGateTintToPlanet(material, params)
  })

  return (
    <group ref={group}>
      <GroundStrata material={material} />
      <HeatTiles material={material} isHeatPlanet={isHeatPlanetNow} />
    </group>
  )
}

/** The #4 terrain budget is 2 ms a frame; the perf log keeps its p95. */
function syncTimed(pool: ChunkMeshPool, view: TerrainView): void {
  const started = performance.now()
  pool.sync(view)
  renderPresence.terrainMs = performance.now() - started
}

/** The #38 visible-block budget, read by the render stats and the perf log; built meshes (#121). */
function recordGroundDrawn(pool: ChunkMeshPool): void {
  renderPresence.groundBlocks = pool.drawnBlockCount()
  renderPresence.drawnChunks = pool.drawnChunkCount()
  renderPresence.builtChunks = pool.builtChunkCount()
}

/** Its planet and world are placeholders, replaced before the pool first reads them. */
function createTerrainViewScratch(): TerrainView {
  return {
    params: planetParamsFor(1, 1),
    world: EMPTY_WORLD,
    centre: vehiclePresence,
    viewRadius: 0,
  }
}

function createTerrainLightScratch(): TerrainLight {
  return {
    lampPosition: vehiclePresence,
    vehicleUp: drillPresence.up,
    facing: drillPresence.facing,
    planetRadiusTiles: 0,
    dt: 0,
    pointLights: lightPresence.pointLights,
    isOreWhispering: false,
    isCacheLive: true,
  }
}
