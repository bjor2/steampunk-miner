import { beforeEach, describe, expect, it } from 'vitest'
import { SPARK_CAPACITY } from '../../../constants/scene'
import { createSprayPool } from '../../../systems/render/sprayPool'
import { admitRequestedSprays } from '../../../scene/sprayIntake'
import { chargeRadiusMm, chargeTypeOf } from '../../../systems/economy/chargeSizes'
import type { QueuedBlast, QueuedFall } from '../systems/render/blastEventQueue'
import { FRONT_DUST_CAPACITY } from '../systems/render/blastLookConstants'
import { blastVfxPlanOf, FULL_EFFECTS } from '../systems/render/blastVfxPlan'
import { blastVfxSeedOf } from '../systems/render/blastVfxSeed'
import { blastFrontPresence } from './blastFrontPresence'
import {
  createBlastFrontPools,
  drawBlastFrontPools,
  stepBlastFrontPools,
  throwFront,
  type BlastFrontPools,
} from './blastFrontPools'
import { playBlast, playFall } from './blastStages'

// D8 (#868): the stages play from fixed pools, capped by count and seeded from the blast's number,
// so the same blast throws the same pieces; a collapse's fall sinks toward the planet's centre.

function blastOf(size: number, blastSeq = 1, isShowcase = false): QueuedBlast {
  return {
    tx: 3,
    ty: 250,
    size,
    chargeType: chargeTypeOf(size),
    radiusLevel: 0,
    blastSeq,
    tick: 100,
    groundRadiusMm: chargeRadiusMm(size),
    casingLaid: false,
    seed: blastVfxSeedOf(0xabc, blastSeq),
    isShowcase,
    groundColour: [0.5, 0.4, 0.3],
  }
}

function play(pools: BlastFrontPools, blast: QueuedBlast): void {
  playBlast(pools, blast, blastVfxPlanOf({ ...blast, switches: FULL_EFFECTS }))
}

function piecesOf(pools: BlastFrontPools): number[] {
  const { fire, dust } = pools
  return [
    ...fire.pool.pool.x.slice(0, fire.pool.pool.count),
    ...fire.pool.pool.y.slice(0, fire.pool.pool.count),
    ...fire.pool.pool.vx.slice(0, fire.pool.pool.count),
    ...fire.pool.pool.vy.slice(0, fire.pool.pool.count),
    ...fire.pool.colour.slice(0, fire.pool.pool.count * 3),
    ...dust.pool.pool.x.slice(0, dust.pool.pool.count),
    ...dust.pool.pool.y.slice(0, dust.pool.pool.count),
    ...dust.pool.pool.vx.slice(0, dust.pool.pool.count),
    ...dust.pool.pool.vy.slice(0, dust.pool.pool.count),
    ...dust.pool.colour.slice(0, dust.pool.pool.count * 3),
  ]
}

describe('blast stages', () => {
  let pools: BlastFrontPools
  let stopAdmitting: () => void
  const spray = createSprayPool()

  beforeEach(() => {
    pools = createBlastFrontPools()
    spray.particles.count = 0
    stopAdmitting = admitRequestedSprays(spray, { x: 0, y: 0 })
    blastFrontPresence.blastsPlayed = 0
    blastFrontPresence.showcasesPlayed = 0
    blastFrontPresence.fallsPlayed = 0
  })

  it('throws every stage of a size-6 blast into the pools, within their capacities, and its debris to the kernel spray', () => {
    const blast = blastOf(6)
    const plan = blastVfxPlanOf({ ...blast, switches: FULL_EFFECTS })
    play(pools, blast)
    stopAdmitting()
    expect(pools.fire.pool.pool.count).toBe(plan.counts.fireballSparks + plan.counts.embers)
    expect(pools.dust.pool.pool.count).toBe(
      plan.counts.plume + plan.counts.smoke + plan.counts.chips,
    )
    expect(spray.particles.count).toBe(plan.counts.debris)
    drawBlastFrontPools(pools)
    expect(pools.counts.isFlashShown).toBe(true)
    expect(pools.counts.isShockwaveShown).toBe(true)
    expect(blastFrontPresence.blastsPlayed).toBe(1)
    expect(blastFrontPresence.showcasesPlayed).toBe(0)
  })

  it('never holds more than its pools, however many blasts land in one frame', () => {
    for (let blast = 0; blast < 6; blast++) play(pools, blastOf(12, blast))
    stopAdmitting()
    expect(pools.fire.pool.pool.count).toBeLessThanOrEqual(SPARK_CAPACITY)
    expect(pools.dust.pool.pool.count).toBeLessThanOrEqual(FRONT_DUST_CAPACITY)
    expect(spray.particles.count).toBeLessThanOrEqual(spray.particles.capacity)
  })

  it('throws the same pieces for the same blast number, and other pieces for the next', () => {
    play(pools, blastOf(6, 4))
    const first = piecesOf(pools)
    const again = createBlastFrontPools()
    play(again, blastOf(6, 4))
    expect(piecesOf(again)).toEqual(first)
    const next = createBlastFrontPools()
    play(next, blastOf(6, 5))
    expect(piecesOf(next)).not.toEqual(first)
    stopAdmitting()
  })

  it("throws a blast's later fronts from its own seeded random too", () => {
    const front = { tx: 3, ty: 250, rInnerMm: 0, rOuterMm: 2500 }
    const run = () => {
      const fresh = createBlastFrontPools()
      play(fresh, blastOf(6, 9))
      stepBlastFrontPools(fresh, 10)
      throwFront(fresh, front)
      return piecesOf(fresh)
    }
    expect(run()).toEqual(run())
    stopAdmitting()
  })

  it('counts a showcase blast and paints the fire in the type colour, the chips in the ground colours', () => {
    const blast = blastOf(10, 2, true)
    const plan = blastVfxPlanOf({ ...blast, switches: FULL_EFFECTS })
    play(pools, blast)
    stopAdmitting()
    expect(blastFrontPresence.showcasesPlayed).toBe(1)
    const [r, g, b] = pools.fire.pool.colour
    expect(`${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}`).toBe(
      plan.colours.fire === '#bfe8ff' ? '0.75,0.91,1.00' : 'other',
    )
  })

  it('sinks a fall toward the planet centre as dust and chips, never fire, and counts it', () => {
    const fall: QueuedFall = { x0: 40, y0: 0, sizeM: 4 }
    playFall(pools, fall)
    stopAdmitting()
    const dust = pools.dust.pool.pool
    expect(dust.count).toBe(24 + 6)
    expect(pools.fire.pool.pool.count).toBe(0)
    for (let at = 0; at < dust.count; at++) {
      // The pieces start on the block's face, east of the centre, and move west toward it.
      expect(dust.x[at]).toBeGreaterThanOrEqual(40)
      expect(dust.vx[at]).toBeLessThan(0)
    }
    expect(blastFrontPresence.fallsPlayed).toBe(1)
    drawBlastFrontPools(pools)
    expect(pools.counts.isFlashShown).toBe(false)
    expect(pools.counts.isShockwaveShown).toBe(false)
  })

  it('lets the pieces die off and the disc and ring go out as they are stepped', () => {
    play(pools, blastOf(1))
    stopAdmitting()
    for (let frame = 0; frame < 60 * 6; frame++) {
      stepBlastFrontPools(pools, 1 / 60)
      drawBlastFrontPools(pools)
    }
    expect(pools.fire.pool.pool.count).toBe(0)
    expect(pools.dust.pool.pool.count).toBe(0)
    expect(pools.counts.isFlashShown).toBe(false)
    expect(pools.counts.isShockwaveShown).toBe(false)
  })
})
