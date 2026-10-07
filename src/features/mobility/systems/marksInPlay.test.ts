import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { add, div, fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { press, sessionWith } from '../mobilityTestSession'
import { MOBILITY_ITEM } from './itemIds'
import { mobilityOf } from './mobilitySection'

// Marks in play (#249, #162 4.6): each effect lasts or reaches as far as the item's ladder at the
// Mark researched when it acts. A Mark comes every 3 planets from the item's unlock planet.
// Pressed at tick 10, each item acts after its 6-tick wind-up, on tick 16.
const ACT_TICK = 16

/** Every node through `planetIndex` researched, as the debug "jump to depth" grants it. */
function researchThrough(session: ScriptedSession, planetIndex: number): void {
  session.submit(2, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex },
  } as CommandIntent)
}

function usedAt(
  itemId: string,
  planetIndex: number,
  facing: Facing = FACING.right,
): ScriptedSession {
  const session = sessionWith({ 'powerup.1': itemId }, facing)
  researchThrough(session, planetIndex)
  session.submit(10, press())
  session.advanceTo(ACT_TICK)
  return session
}

const motionOf = (session: ScriptedSession, tick: number) =>
  vehicleMotionAt(session.state(), 'p1', tick)

describe('mobility marks in play', () => {
  it('bursts a Mark 3 steam boost for 34 ticks, where Mark 1 bursts for 30', () => {
    // Unlocked at P12: Mark 2 (P15) steps the cooldown, Mark 3 (P18) the burst, 30 x 1.15.
    const session = usedAt(MOBILITY_ITEM.steamBoost, 18, FACING.left)
    expect(motionOf(session, ACT_TICK + 33).burst).not.toBeNull()
    expect(motionOf(session, ACT_TICK + 34).burst).toBeNull()
  })

  it('lightens the miner for a Mark 2 ballast drop’s 345 ticks, where Mark 1 lasts 300', () => {
    // Unlocked at P5; a consumable steps its window first, at Mark 2 (P8): 300 x 1.15.
    const session = usedAt(MOBILITY_ITEM.emergencyBallast, 8)
    expect(mobilityOf(session.state(), 'p1').ballastUntilTick).toBe(ACT_TICK + 345)
  })

  it('raises a Mark 3 steam shield for 138 ticks, where Mark 1 holds for 120', () => {
    // Unlocked at P22: Mark 3 (P28) steps the window, 120 x 1.15.
    const session = usedAt(MOBILITY_ITEM.steamShield, 28)
    expect(mobilityOf(session.state(), 'p1').shieldUntilTick).toBe(ACT_TICK + 138)
  })

  it('plates a Mark 2 rivet patch’s 28.75% of hullMax on, where Mark 1 plates 25%', () => {
    // Unlocked at P16; Mark 2 (P19) steps the plate first: 2500 x 1.15 basis points.
    const session = sessionWith({ 'powerup.1': MOBILITY_ITEM.rivetPatch })
    researchThrough(session, 19)
    session.submit(3, { type: 'debug.setHull', payload: { hull: '10' } })
    session.submit(10, press())
    session.advanceTo(ACT_TICK + 92)
    const hullMax = statsOfVehicle(session.vehicle()).hullMax
    const plate = div(mul(hullMax, fromSafeInteger(2875)), fromSafeInteger(10_000))
    expect(toCanonical(session.vehicle().hull)).toBe(toCanonical(add(fromSafeInteger(10), plate)))
  })
})
