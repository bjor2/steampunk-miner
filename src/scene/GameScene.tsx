/**
 * The 2D world: an orthographic camera looking down -Z at the XY plane, rolling with the planet
 * (#13). Frames go through `RenderPipeline` (#38: bloom, tone curve, vignette, adaptive render
 * scale); `flat` leaves three's own tone mapping off, because the composite pass does it.
 */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION, CANVAS_DPR_RANGE } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { useGameStore } from '../store/gameStore'
import { CementSpray } from './CementSpray'
import { BlastScorches } from './BlastScorches'
import { CollapseTelegraph } from './CollapseTelegraph'
import { EnemyFigures } from './EnemyFigures'
import { LightRig } from './LightRig'
import { PerfSampler } from './PerfSampler'
import { PlanetCamera } from './PlanetCamera'
import { PlanetTerrain } from './PlanetTerrain'
import { PlatformYard } from './PlatformYard'
import { RenderPipeline } from './RenderPipeline'
import { SceneLayers } from './SceneLayers'
import { ScreenFeedback } from './ScreenFeedback'
import { ScreenProjectorFeed } from './ScreenProjectorFeed'
import { SkyBackground } from './SkyBackground'
import { SoundStage } from './SoundStage'
import { Sparks } from './Sparks'
import { Vehicle } from './Vehicle'
import { WorldPieces } from './WorldPieces'

export function GameScene() {
  // One human player in the slice, so settings pause the local game (#33); never a command.
  const isPaused = useGameStore((state) => state.isSettingsOpen)
  // `PlanetCamera` sets the zoom from the canvas size every frame (#39).
  return (
    <Canvas
      flat
      orthographic
      dpr={[...CANVAS_DPR_RANGE]}
      // The canvas only takes the composite; multisampling it would only cost fill (#38).
      gl={{ antialias: false }}
      camera={{ position: [...CAMERA_POSITION] }}
    >
      <SkyBackground />
      <ScreenFeedback />
      <PlanetCamera />
      <LightRig />
      <PlanetTerrain />
      <PlatformYard />
      <WorldPieces layer="platform" />
      <EnemyFigures />
      <PhysicsWorld isPaused={isPaused}>
        <Vehicle />
      </PhysicsWorld>
      <Sparks />
      <CementSpray />
      <CollapseTelegraph />
      <BlastScorches />
      <SceneLayers />
      <SoundStage />
      <PerfSampler />
      <ScreenProjectorFeed />
      <RenderPipeline />
    </Canvas>
  )
}
