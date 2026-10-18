/**
 * The planet's tiles: the chunk meshes under the camera, lit by the vehicle's headlamp. Per-frame
 * work stays out of React: the pool and the material are created once and updated in `useFrame`.
 * The meshes sit at their chunk corners under the world root; the shader learns the render origin
 * (ticket 339), so a moved origin rebuilds none of them. The chunk worker (ticket 337) lives as long
 * as the pool and builds its meshes' parts off the main thread. A GPU short of the full terrain
 * program (ticket 477) draws the lite one, which never loads the strata maps; only a GPU the probe
 * gives the 16th unit loads the per-act hero atlas (ticket 451).
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, OrthographicCamera } from 'three'
import { writeArtefactLook } from '../store/artefactActions'
import { readPlanetWorld, useGameStore } from '../store/gameStore'
import { startChunkWorker } from '../shell/chunkWorkerPort'
import { viewRadiusOf } from '../systems/render/visibleChunks'
import { planetParamsFor } from '../systems/world/planetParams'
import { EMPTY_WORLD } from '../systems/world/worldState'
import { createChunkMeshPool, type ChunkMeshPool, type TerrainView } from './chunkMeshPool'
import { drillPresence } from './drillPresence'
import { lightPresence } from './lightPresence'
import { motionPresence } from './motionPresence'
import { renderPresence } from './renderPresence'
import { GroundStrata } from './GroundStrata'
import { HeatTiles } from './HeatTiles'
import { HeroAtlas } from './HeroAtlas'
import { isHeatPlanet } from '../systems/economy/heatEconomy'
import { heroAtlasUnitOf, terrainProgramOf } from '../systems/render/gpuTier'
import { readGpuCapabilities } from './gpuCapabilities'
import { createTerrainMaterial, lightTerrain, type TerrainLight } from './terrainMaterial'
import { fitTerrainToOrigin } from './terrainOrigin'
import { noteHeroAtlasUnit } from './terrainHeroAtlas'
import { renderOriginPresence } from './renderOriginPresence'
import { fitGateTintToPlanet } from './terrainGateTint'
import { fitGateToViewer } from './terrainGateViewer'
import { fitKindLooksToViewer } from './terrainKindLooks'
import { groundGatePresence, NO_DRAWN_GROUND } from './groundGatePresence'
import { fitStrataToPlanet } from './terrainStrata'
import { vehiclePresence } from './vehiclePresence'

export function PlanetTerrain() {
  const group = useRef<Group>(null)
  const pool = useRef<ChunkMeshPool | null>(null)
  const gl = useThree((state) => state.gl)
  const program = useMemo(() => terrainProgramOf(readGpuCapabilities(gl)), [gl])
  const heroAtlas = useMemo(() => heroAtlasUnitOf(readGpuCapabilities(gl)), [gl])
  const material = useMemo(() => createTerrainMaterial(program, heroAtlas), [program, heroAtlas])
  // Reused every frame, so the frame loop allocates nothing.
  const view = useMemo(createTerrainViewScratch, [])
  const light = useMemo(createTerrainLightScratch, [])
  const isHeatPlanetNow = useGameStore((state) => isHeatPlanet(state.planetTier))

  useEffect(() => noteHeroAtlasUnit(heroAtlas), [heroAtlas])

  useEffect(() => {
    if (group.current === null) return
    const worker = startChunkWorker()
    const created = createChunkMeshPool(group.current, material, worker)
    pool.current = created
    groundGatePresence.gateBitsAt = created.gateBitsAt
    return () => {
      groundGatePresence.gateBitsAt = NO_DRAWN_GROUND
      created.dispose()
      worker?.terminate()
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
    fitTerrainToOrigin(material, params, renderOriginPresence)
    fitGateTintToPlanet(material, params)
    fitGateToViewer(material)
    fitKindLooksToViewer(material, params)
  })

  return (
    <group ref={group}>
      {program === 'full' && <GroundStrata material={material} />}
      {heroAtlas === 'sampled' && <HeroAtlas material={material} />}
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

/**
 * The #38 visible-block budget, read by the render stats and the perf log; built meshes (#121);
 * whether the chunk worker builds them and how many in view still lack one (ticket 337).
 */
function recordGroundDrawn(pool: ChunkMeshPool): void {
  renderPresence.groundBlocks = pool.drawnBlockCount()
  renderPresence.drawnChunks = pool.drawnChunkCount()
  renderPresence.builtChunks = pool.builtChunkCount()
  renderPresence.isTerrainWorkerMeshing = pool.isWorkerMeshing()
  renderPresence.unbuiltVisibleChunks = pool.unbuiltVisibleChunkCount()
}

/** Its planet and world are placeholders, replaced before the pool first reads them. */
function createTerrainViewScratch(): TerrainView {
  return {
    params: planetParamsFor(1, 1),
    world: EMPTY_WORLD,
    centre: vehiclePresence,
    viewRadius: 0,
    ahead: drillPresence.ahead,
    velocity: motionPresence.velocity,
  }
}

function createTerrainLightScratch(): TerrainLight {
  return {
    renderOrigin: renderOriginPresence,
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
