import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import type { PartPoseRequest } from '../../../systems/registries/partMotionRequests'
import { momentTicksOf } from '../systems/render/showcaseReactions'
import { resetWorkshopStore, useWorkshopStore } from '../store/workshopStore'
import { SHOWCASE_PART_MOTION } from './showcaseParts'

const game = () => useGameStore.getState()
let stopListening = () => {}

beforeEach(() => {
  resetGameStore()
  resetWorkshopStore()
  stopListening = listenForDomainEvents(useWorkshopStore.getState().hearPurchases)
  game().giveMoney('1e9')
  game().teleportToDock('upgrade')
})

afterEach(() => stopListening())

function buyOne(upgradeId: 'drill_power' | 'cargo_hold'): void {
  useWorkshopStore.getState().pressTrack(upgradeId, readAuthorityState().tick)
  useWorkshopStore.getState().releaseHold()
}

function posesNow(): PartPoseRequest[] {
  return SHOWCASE_PART_MOTION.requestsNow().filter(
    (request): request is PartPoseRequest => request.kind === 'pose',
  )
}

describe('workshop showcase parts', () => {
  it("asks for nothing while no step's reaction plays", () => {
    expect(SHOWCASE_PART_MOTION.requestsNow()).toEqual([])
  })

  it("sways the bought track's own part on the step it lands", () => {
    buyOne('cargo_hold')
    const poses = posesNow()

    expect(poses.map((pose) => pose.attach)).toEqual(['hull.cargo'])
    expect(poses[0].slots).toContain('hopper')
    expect(Math.abs(poses[0].angle) + poses[0].glow).toBeGreaterThan(0)
  })

  it('lets the part rest once its moment is over', () => {
    buyOne('drill_power')
    for (let run = 0; run < momentTicksOf('pip'); run++) game().advanceOneTick()

    expect(posesNow()).toEqual([])
  })

  it('answers the same kept array every step', () => {
    buyOne('drill_power')
    const first = SHOWCASE_PART_MOTION.requestsNow()

    expect(SHOWCASE_PART_MOTION.requestsNow()).toBe(first)
  })
})
