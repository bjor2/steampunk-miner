/**
 * The 2D world: an orthographic camera looking down -Z at the XY plane, rolling with the planet
 * (#13). Frames go through `RenderPipeline` (#38: bloom, tone curve, vignette, adaptive render
 * scale); `flat` leaves three's own tone mapping off, because the composite pass does it.
 */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { useGameStore } from '../store/gameStore'
import { CementSpray } from './CementSpray'
import { EnemyFigures } from './EnemyFigures'
import { LightRig } from './LightRig'
import { PerfSampler } from './PerfSampler'
import { PlanetCamera } from './PlanetCamera'
import { PlanetTerrain } from './PlanetTerrain'
import { PlatformPlaceholder } from './PlatformPlaceholder'
import { RenderPipeline } from './RenderPipeline'
import { ScreenFeedback } from './ScreenFeedback'
import { SkyBackground } from './SkyBackground'
import { SoundStage } from './SoundStage'
import { Sparks } from './Sparks'
import { Vehicle } from './Vehicle'

export function GameScene() {
  // One human player in the slice, so settings pause the local game (#33); never a command.
  const isPaused = useGameStore((state) => state.isSettingsOpen)
  // `PlanetCamera` sets the zoom from the canvas size every frame (#39).
  return (
    <Canvas
      flat
      orthographic
      // The canvas only takes the composite; multisampling it would only cost fill (#38).
      gl={{ antialias: false }}
      camera={{ position: [...CAMERA_POSITION] }}
    >
      <SkyBackground />
      <ScreenFeedback />
      <PlanetCamera />
      <LightRig />
      <PlanetTerrain />
      <PlatformPlaceholder />
      <EnemyFigures />
      <PhysicsWorld isPaused={isPaused}>
        <Vehicle />
      </PhysicsWorld>
      <Sparks />
      <CementSpray />
      <SoundStage />
      <PerfSampler />
      <RenderPipeline />
    </Canvas>
  )
}
