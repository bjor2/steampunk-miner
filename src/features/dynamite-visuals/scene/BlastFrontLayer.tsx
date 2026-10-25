/**
 * The blast's front and its explosion in the world (#153 looks 1-3, the #145 TD lock; wired in
 * #215; the explosion pass of D8, ticket 868): each `BlastFront` slice (K6 #189) throws fire and
 * dust across the ring it uncovered and debris out of it, so the ring rides the clearing's edge
 * tick by tick; each `BlastStarted` plays its stages from the plan (`blastVfxPlan.ts`): the flash,
 * the fireball, the shockwave, the debris and chips, the plume, the embers and the smoke, the
 * showcase's longer flash and banner; each collapse a blast rolled falls when its refill starts.
 * The debris draws in the kernel's spray layer at blast priority (ticket 348). Fixed pools placed
 * in `useFrame`, never through React; it never writes the authority, the camera or the sound. A
 * debug preview (`previewBlast`) feeds it a solid-rock blast with no world change.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import { clearBlastFeed, hearBlastEvents, takeBlastFeed } from '../store/blastFeed'
import { showShowcaseBanner } from '../store/showcaseBanner'
import type { BlastEventQueue, QueuedBlast } from '../systems/render/blastEventQueue'
import {
  blastEffectSwitchesOf,
  blastVfxPlanOf,
  type BlastEffectSwitches,
} from '../systems/render/blastVfxPlan'
import {
  createBlastFrontPools,
  drawBlastFrontPools,
  gpuResourcesOf,
  stepBlastFrontPools,
  throwFront,
  type BlastFrontPools,
} from './blastFrontPools'
import { playBlast, playFall } from './blastStages'

export const BLAST_FRONT_LAYER_ID = 'dynamite-visuals.front'

export function BlastFrontLayer() {
  const pools = useMemo(createBlastFrontPools, [])
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(pools), [pools]))
  useEffect(() => listenForDomainEvents(hearBlastEvents), [])
  useFrame((_, delta) => {
    stepBlastFrontPools(pools, delta)
    playQueuedBlasts(pools, takeBlastFeed(), blastEffectSwitchesOf(useGameStore.getState().prefs))
    drawBlastFrontPools(pools)
  })
  return (
    <>
      <points
        geometry={pools.fire.pool.geometry}
        material={pools.fire.pool.material}
        frustumCulled={false}
      />
      <points
        geometry={pools.dust.pool.geometry}
        material={pools.dust.pool.material}
        frustumCulled={false}
      />
      <primitive object={pools.flashball.mesh} />
      <primitive object={pools.shockwave.pool.mesh} />
    </>
  )
}

/** Plays every queued blast, throws every queued front, sinks every queued fall, clears the queue. */
function playQueuedBlasts(
  pools: BlastFrontPools,
  queue: BlastEventQueue,
  switches: BlastEffectSwitches,
): void {
  for (let at = 0; at < queue.blastCount; at++) playOneBlast(pools, queue.blasts[at], switches)
  for (let at = 0; at < queue.frontCount; at++) throwFront(pools, queue.fronts[at])
  for (let at = 0; at < queue.fallCount; at++) playFall(pools, queue.falls[at])
  clearBlastFeed()
}

function playOneBlast(
  pools: BlastFrontPools,
  blast: QueuedBlast,
  switches: BlastEffectSwitches,
): void {
  const plan = blastVfxPlanOf({ ...blast, switches })
  playBlast(pools, blast, plan)
  if (plan.banner !== null) showShowcaseBanner(plan.banner, blast.tick)
}
