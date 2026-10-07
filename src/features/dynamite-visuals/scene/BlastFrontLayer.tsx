/**
 * The blast's front in the world (#153 looks 1-3, the #145 TD lock; wired in #215): each
 * `BlastFront` slice (K6 #189) throws fire and dust across the ring it uncovered and debris out
 * of it, so the ring rides the clearing's edge tick by tick; each detonation lights the size's
 * flash sprite for two frames while the player's flash switch is on. Fixed pools placed in
 * `useFrame`, never through React; it never writes the authority, the camera or the sound.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  type BlastEventQueue,
} from '../systems/render/blastEventQueue'
import { QUEUED_BLAST_EVENTS } from '../systems/render/blastLookConstants'
import {
  createBlastFrontPools,
  drawBlastFrontPools,
  gpuResourcesOf,
  lightFlash,
  stepBlastFrontPools,
  throwFront,
  type BlastFrontPools,
} from './blastFrontPools'

export const BLAST_FRONT_LAYER_ID = 'dynamite-visuals.front'

export function BlastFrontLayer() {
  const queue = useMemo(() => createBlastEventQueue(QUEUED_BLAST_EVENTS), [])
  const pools = useMemo(createBlastFrontPools, [])
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(pools), [pools]))
  useEffect(() => listenForDomainEvents((events) => queueBlastEvents(queue, events)), [queue])
  useFrame((_, delta) => {
    stepBlastFrontPools(pools, delta)
    throwQueuedBlasts(pools, queue)
    drawBlastFrontPools(pools)
  })
  return (
    <>
      <points geometry={pools.fireGeometry} material={pools.fireMaterial} frustumCulled={false} />
      <points geometry={pools.dustGeometry} material={pools.dustMaterial} frustumCulled={false} />
      <primitive object={pools.debrisMesh} />
      <primitive object={pools.flashMesh} />
    </>
  )
}

/** Throws every queued front, lights the queued flashes the switch allows, and clears the queue. */
function throwQueuedBlasts(pools: BlastFrontPools, queue: BlastEventQueue): void {
  for (let at = 0; at < queue.frontCount; at++) throwFront(pools, queue.fronts[at])
  if (useGameStore.getState().prefs.flashes) lightQueuedFlashes(pools, queue)
  clearBlastEventQueue(queue)
}

function lightQueuedFlashes(pools: BlastFrontPools, queue: BlastEventQueue): void {
  for (let at = 0; at < queue.flashCount; at++) lightFlash(pools, queue.flashes[at])
}
