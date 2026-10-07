/**
 * The power-up effects in the world (ticket 250; looks from #166): every `PowerUpUsed` starts its
 * item's effects, drawn as motes from fixed pools placed in `useFrame`, never through React. It
 * never writes the authority, the camera or the sound. A debug preview (`previewPowerUpFx`) plays
 * an item's effects at the vehicle with no command.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { clearFxStarts, hearPowerUpUses, queuedFxStarts } from '../store/powerUpFxFeed'
import {
  createPowerUpFxPools,
  drawPowerUpFx,
  gpuResourcesOf,
  startQueuedFx,
  stepPowerUpFx,
} from './powerUpFxPools'
import { showFxRuns } from './powerUpFxPresence'

export const POWER_UP_FX_LAYER_ID = 'tech-tree.power-up-fx'

export function PowerUpFxLayer() {
  const fx = useMemo(createPowerUpFxPools, [])
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(fx), [fx]))
  useEffect(() => listenForDomainEvents(hearPowerUpUses), [])
  useEffect(() => showFxRuns(fx.runs), [fx])
  useFrame((_, delta) => {
    startQueuedFx(fx, queuedFxStarts())
    clearFxStarts()
    stepPowerUpFx(fx, delta)
    drawPowerUpFx(fx)
  })
  return (
    <>
      {fx.geometries.map((geometry, at) => (
        <points key={at} geometry={geometry} material={fx.materials[at]} frustumCulled={false} />
      ))}
    </>
  )
}
