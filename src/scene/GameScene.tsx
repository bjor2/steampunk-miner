/**
 * The 2D world: an orthographic camera looking down -Z at the XY plane, rolling with the planet
 * (#13). Frames go through `RenderPipeline` (#38: bloom, tone curve, vignette, adaptive render
 * scale); `flat` leaves three's own tone mapping off, because the composite pass does it.
 * Whatever is placed in planet metres hangs under the world root, measured with the camera from the
 * floating render origin (ticket 339); the particle pools are render-local, and the flash veil
 * follows the camera.
 */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION, CANVAS_DPR_RANGE } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { useGameStore } from '../store/gameStore'
import { isLiveStepHeld } from '../store/liveStepSlice'
import { CementSpray } from './CementSpray'
import { BlastScorches } from './BlastScorches'
import { CanvasScreenshots } from './CanvasScreenshots'
import { CollapseTelegraph } from './CollapseTelegraph'
import { EnemyFigures } from './EnemyFigures'
import { LightRig } from './LightRig'
import { PerfSampler } from './PerfSampler'
import { PlanetCamera } from './PlanetCamera'
import { PlanetSkyBand } from './PlanetSkyBand'
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
import { WorldRoot } from './WorldRoot'

/**
 * One human player in the slice, so settings pause the local game (#33), and a scenario waits for
 * play (ticket 301); never a command. Read each frame, so a hold set by a debug call holds at once.
 */
function isGameHeld(): boolean {
  return isLiveStepHeld(useGameStore.getState())
}

export function GameScene() {
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
      <WorldRoot>
        <PlanetSkyBand />
        <LightRig />
        <PlanetTerrain />
        <PlatformYard />
        <WorldPieces layer="platform" />
        <EnemyFigures />
        <PhysicsWorld isHeld={isGameHeld}>
          <Vehicle />
        </PhysicsWorld>
        <CollapseTelegraph />
        <BlastScorches />
        <SceneLayers />
      </WorldRoot>
      <Sparks />
      <CementSpray />
      <SoundStage />
      <PerfSampler />
      <ScreenProjectorFeed />
      <RenderPipeline />
      <CanvasScreenshots />
    </Canvas>
  )
}
