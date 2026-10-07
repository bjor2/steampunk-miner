import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { add, div, fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { chargesLeftOf, intentToHoldSlot, powerUpAtMarkOf } from '../../power-up-core'
import { ofType, press, sessionWith, standInCavity } from '../mobilityTestSession'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { ballastGainBp } from './mobilityMotion'
import { mobilityOf, type MobilityState } from './mobilitySection'

// The Mark 6 and Mark 9 milestones of the mobility items (the GD lock on #256, ticket 275): the
// hold (a toggle's second tap) and the sibling-link. Pressed at tick 10, an item with a wind-up
// acts at 16; a toggle switches on at 10.

const PRESS_TICK = 10
const ACT_TICK = 16
const N = MOBILITY_ECONOMY

const UNLOCK_PLANET: Readonly<Record<MobilityItemId, number>> = {
  [MOBILITY_ITEM.grappleWinch]: 3,
  [MOBILITY_ITEM.emergencyBallast]: 5,
  [MOBILITY_ITEM.heatSinkFlask]: 9,
  [MOBILITY_ITEM.steamBoost]: 12,
  [MOBILITY_ITEM.rivetPatch]: 16,
  [MOBILITY_ITEM.steamShield]: 22,
  [MOBILITY_ITEM.smokeCanister]: 27,
  [MOBILITY_ITEM.gravAnchor]: 32,
  [MOBILITY_ITEM.buoyancyTanks]: 34,
  [MOBILITY_ITEM.escapeThruster]: 37,
}

/** The planet whose research reaches the item's Mark: a Mark every 3 planets from its unlock. */
const planetOfMark = (itemId: MobilityItemId, mark: number) =>
  UNLOCK_PLANET[itemId] + 3 * (mark - 1)

function fieldAt(
  itemId: MobilityItemId,
  mark: number,
  setup: { sibling?: MobilityItemId; facing?: Facing; isInCavity?: boolean } = {},
): ScriptedSession {
  const facing = setup.facing ?? FACING.right
  const slots = { 'powerup.1': itemId, ...(setup.sibling && { 'powerup.2': setup.sibling }) }
  const session = sessionWith(slots, facing)
  session.submit(2, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex: planetOfMark(itemId, mark) },
  } as CommandIntent)
  if (setup.isInCavity) standInCavity(session, 3, facing)
  return session
}

const mobility = (session: ScriptedSession) => mobilityOf(session.state(), 'p1')

const linkLinesOf = (events: readonly DomainEvent[]) => ofType(events, 'power-up-core.LinkFired')

/** The item used, then the slot held the tick after it acts, run to the tick after the hold acts. */
function heldAfterUse(session: ScriptedSession, windup: number): MobilityState {
  session.submit(PRESS_TICK, press())
  session.advanceTo(PRESS_TICK + windup)
  session.submit(PRESS_TICK + windup + 1, intentToHoldSlot('powerup.1'))
  session.advanceTo(PRESS_TICK + 2 * windup + 2)
  return mobility(session)
}

describe('mobility Mark milestones: the Mark 6 hold (#256)', () => {
  const magnitudeAt6 = (itemId: MobilityItemId) => {
    const session = fieldAt(itemId, 6)
    return powerUpAtMarkOf(session.state(), 'p1', itemId)?.magnitude as number
  }

  it('reels the grapple in faster', () => {
    const value = heldAfterUse(fieldAt(MOBILITY_ITEM.grappleWinch, 6, { isInCavity: true }), 6)
    expect(value.reel?.driveBp).toBe(N.milestones.fastReelDriveBp)
  })

  it('runs the ballast drop, the boost, the curtain, the smoke and the climb on for one more window', () => {
    const longer = (itemId: MobilityItemId, untilOf: (value: MobilityState) => number | null) => {
      const options = { isInCavity: itemId === MOBILITY_ITEM.escapeThruster }
      const value = heldAfterUse(fieldAt(itemId, 6, options), 6)
      return untilOf(value) === ACT_TICK + 2 * magnitudeAt6(itemId)
    }
    expect(longer(MOBILITY_ITEM.emergencyBallast, (value) => value.ballastUntilTick)).toBe(true)
    expect(longer(MOBILITY_ITEM.steamBoost, (value) => value.boost?.untilTick ?? null)).toBe(true)
    expect(longer(MOBILITY_ITEM.steamShield, (value) => value.shieldUntilTick)).toBe(true)
    expect(longer(MOBILITY_ITEM.smokeCanister, (value) => value.smoke?.untilTick ?? null)).toBe(
      true,
    )
    expect(longer(MOBILITY_ITEM.escapeThruster, (value) => value.escape?.untilTick ?? null)).toBe(
      true,
    )
  })

  it('pauses heat again once the first flask’s pause ends', () => {
    const value = heldAfterUse(fieldAt(MOBILITY_ITEM.heatSinkFlask, 6), 6)
    expect(value.heatSinks).toHaveLength(2)
    expect(value.heatSinks[1].fromTick).toBe(value.heatSinks[0].untilTick)
  })

  it('kicks the grav anchor off the face it grips and drifts the buoyancy tanks, at Mark 6 second tap', () => {
    const tappedTwice = (itemId: MobilityItemId) => {
      const session = fieldAt(itemId, 6)
      session.submit(PRESS_TICK, press())
      session.submit(PRESS_TICK + 10, press())
      return vehicleMotionAt(session.state(), 'p1', PRESS_TICK + 11)
    }
    expect(tappedTwice(MOBILITY_ITEM.gravAnchor).burst?.x).toBeLessThan(0)
    expect(tappedTwice(MOBILITY_ITEM.buoyancyTanks).driveBoostBp).toBe(N.milestones.spellBoostBp)
  })

  it('lands both plates of a rivet patch tapped twice when the hold finishes', () => {
    const session = fieldAt(MOBILITY_ITEM.rivetPatch, 3)
    session.submit(3, { type: 'debug.setHull', payload: { hull: '10' } })
    session.submit(PRESS_TICK, press())
    session.submit(ACT_TICK + 10, press())
    session.advanceTo(ACT_TICK + N.rivetPatch.holdTicks + 2)
    const shareBp = powerUpAtMarkOf(session.state(), 'p1', MOBILITY_ITEM.rivetPatch)?.magnitude
    const hullMax = statsOfVehicle(session.vehicle()).hullMax
    const plates = div(
      mul(hullMax, fromSafeInteger(2 * (shareBp as number))),
      fromSafeInteger(10_000),
    )
    expect(toCanonical(session.vehicle().hull)).toBe(toCanonical(add(fromSafeInteger(10), plates)))
  })
})

/** Each item's link: the Mark it sits at and the sibling it fires. */
const LINKS: readonly { itemId: MobilityItemId; mark: number; sibling: MobilityItemId }[] = [
  { itemId: MOBILITY_ITEM.grappleWinch, mark: 9, sibling: MOBILITY_ITEM.steamBoost },
  { itemId: MOBILITY_ITEM.emergencyBallast, mark: 9, sibling: MOBILITY_ITEM.grappleWinch },
  { itemId: MOBILITY_ITEM.heatSinkFlask, mark: 9, sibling: MOBILITY_ITEM.steamShield },
  { itemId: MOBILITY_ITEM.steamBoost, mark: 9, sibling: MOBILITY_ITEM.emergencyBallast },
  { itemId: MOBILITY_ITEM.rivetPatch, mark: 6, sibling: MOBILITY_ITEM.steamShield },
  { itemId: MOBILITY_ITEM.smokeCanister, mark: 9, sibling: MOBILITY_ITEM.steamBoost },
  { itemId: MOBILITY_ITEM.gravAnchor, mark: 9, sibling: MOBILITY_ITEM.rivetPatch },
  { itemId: MOBILITY_ITEM.buoyancyTanks, mark: 9, sibling: MOBILITY_ITEM.emergencyBallast },
  { itemId: MOBILITY_ITEM.escapeThruster, mark: 9, sibling: MOBILITY_ITEM.smokeCanister },
]

describe('mobility Mark milestones: the sibling-link (#256)', () => {
  it.each(LINKS)(
    'fires $sibling from $itemId’s act at Mark $mark, spending the sibling’s own charge',
    ({ itemId, mark, sibling }) => {
      const session = fieldAt(itemId, mark, { sibling, isInCavity: true })
      const before = chargesLeftOf(session.state(), 'p1', sibling)
      session.submit(PRESS_TICK, press())
      session.advanceTo(ACT_TICK)
      expect(linkLinesOf(session.events())).toMatchObject([
        { itemId, siblingId: sibling, slot: 'powerup.2' },
      ])
      expect(chargesLeftOf(session.state(), 'p1', sibling)).toBe(before - 1)
    },
  )

  it('fires nothing a Mark before the link', () => {
    const session = fieldAt(MOBILITY_ITEM.steamBoost, 8, {
      sibling: MOBILITY_ITEM.emergencyBallast,
    })
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK)
    expect(linkLinesOf(session.events())).toEqual([])
  })

  it('bursts the shield’s smoke puff on the curtain’s break, never on its raise', () => {
    const session = fieldAt(MOBILITY_ITEM.steamShield, 9, { sibling: MOBILITY_ITEM.smokeCanister })
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK)
    expect(linkLinesOf(session.events())).toEqual([])
    const breakTick = mobility(session).shieldUntilTick
    session.advanceTo(breakTick)
    expect(linkLinesOf(session.events())).toMatchObject([
      {
        tick: breakTick,
        itemId: MOBILITY_ITEM.steamShield,
        siblingId: MOBILITY_ITEM.smokeCanister,
      },
    ])
    expect(mobility(session).smoke?.radiusTiles).toBe(N.smoke.radiusTiles / 2)
  })

  it('drops a linked ballast at half its lift gain', () => {
    const session = fieldAt(MOBILITY_ITEM.steamBoost, 9, {
      sibling: MOBILITY_ITEM.emergencyBallast,
    })
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK)
    expect(mobility(session).ballastGainBp).toBe(Math.floor(ballastGainBp() / 2))
  })

  it('a linked ballast while a drop runs finds nothing to act on and spends nothing', () => {
    const session = fieldAt(MOBILITY_ITEM.steamBoost, 9, {
      sibling: MOBILITY_ITEM.emergencyBallast,
    })
    session.submit(2, press('powerup.2'))
    session.advanceTo(8)
    const before = chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.emergencyBallast)
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK)
    expect(linkLinesOf(session.events())).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.emergencyBallast)).toBe(before)
    expect(mobility(session).ballastGainBp).toBeUndefined()
  })
})

describe('mobility Mark milestones: the caps (#233)', () => {
  it('keeps a fast rise on a lightened miner under the +2000 bp lift cap', () => {
    const session = fieldAt(MOBILITY_ITEM.buoyancyTanks, 3, {
      sibling: MOBILITY_ITEM.emergencyBallast,
    })
    session.submit(2, press('powerup.2'))
    session.submit(PRESS_TICK, press())
    session.submit(PRESS_TICK + 1, intentToHoldSlot('powerup.1'))
    const motion = vehicleMotionAt(session.state(), 'p1', PRESS_TICK + 2)
    expect(motion.isHovering).toBe(true)
    expect(motion.liftBoostBp).toBe(2000)
  })
})
