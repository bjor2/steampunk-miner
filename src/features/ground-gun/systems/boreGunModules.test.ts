import { describe, expect, it } from 'vitest'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { FIRE_EAST, PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { boreAutoShootOf, boreGunOf } from '../../../systems/registries/boreGun'
import { withSection } from '../../../systems/registries/saveSections'
import { EXTRACTION_TRIP_SECTION, incomeTripOf } from '../../extraction'
import { LONG_BARREL_ITEM_ID } from './boreGunLane'
import { searWaitTicksAt, sightRetargetTicksAt } from './boreGunModules'
import { longBarrelMasteredMark } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const FIRE_TICK = 10
const PLAYER = 'p1'
/** The Mark planets of a P12 capability on M = 3: Mark 6 at P27, Mastered Mark 11 at P42. */
const LONG_BARREL_MARK_PLANET: Readonly<Record<number, number>> = { 1: 12, 6: 27, 11: 42 }

const mountAtL1: CommandIntent = {
  type: 'debug.ground-gun.setLevels',
  payload: { rate: 1, penetration: 1, energy: 1 },
}

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } }
}

/** A mounted gun in planet 1's rock pocket, owning `owned`, with the tree researched through `planet`. */
function gunWith(owned: readonly string[], planet = 1): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, mountAtL1)
  session.submit(0, own(owned))
  session.submit(0, researchThrough(planet))
  standInPocket(session, PLAIN_RIG, 0)
  return session
}

function longBarrelAtMark(mark: number): ScriptedSession {
  return gunWith([LONG_BARREL_ITEM_ID], LONG_BARREL_MARK_PLANET[mark])
}

function ticksOf(events: readonly DomainEvent[], type: DomainEvent['type']): number[] {
  return events
    .filter((event) => event.type === type)
    .map((event) => (event as { tick: number }).tick)
}

describe('ground-gun: the long barrel on the gun (ticket 318, #310 range ladder)', () => {
  it('leaves the bore its own reach and hold until the barrel is bought', () => {
    const gun = boreGunOf(gunWith([], 42).state(), PLAYER)
    expect(gun).toMatchObject({
      rangeCells: GROUND_GUN.bore.boreRangeBase,
      collapseHoldTicks: GROUND_GUN.bore.collapseHoldTicks,
    })
  })

  it('reaches one cell further as bought, ten at Mark 6, and holds the extra ticks only past the cap', () => {
    const reachAndHold = (mark: number) => {
      const gun = boreGunOf(longBarrelAtMark(mark).state(), PLAYER)
      return [gun?.rangeCells, gun?.collapseHoldTicks]
    }
    expect(reachAndHold(1)).toEqual([5, 30])
    expect(reachAndHold(6)).toEqual([10, 30])
    expect(reachAndHold(11)).toEqual([10, 45])
  })

  it('still warns an uncased bore at Mastered, the hold cap later than with no hold', () => {
    const warnTicksAt = (mark: number) => {
      const session = longBarrelAtMark(mark)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 200)
      return ticksOf(session.events(), 'CollapseWarned')
    }
    const noHold = warnTicksAt(6)
    const mastered = warnTicksAt(longBarrelMasteredMark())
    expect(noHold.length).toBeGreaterThan(0)
    expect(mastered).toEqual(noHold.map((tick) => tick + GROUND_GUN.longBarrel.holdCap))
  })
})

describe('ground-gun: the steam sear answers auto mode (ticket 318, ticket 317 seam)', () => {
  it('gives auto mode no numbers until the sear is on the gun, so the mode holds unavailable', () => {
    expect(boreAutoShootOf(gunWith([], 6).state(), PLAYER)).toBeNull()
  })

  it("answers #322's preview and reserve, and the sear's wait after a manual shot", () => {
    const state = gunWith([STEAM_SEAR_ITEM_ID], 6).state()
    expect(boreAutoShootOf(state, PLAYER)).toEqual({
      previewTicks: 10,
      manualWaitTicks: 60,
      reserveAboveRescueBp: 1000,
      isIncomeCapUsed: false,
    })
  })

  it('shortens the wait with each Mark but never under the floor of 20', () => {
    const waits = Array.from({ length: 30 }, (_, at) => searWaitTicksAt(at + 1))
    expect(waits[0]).toBe(60)
    expect(waits.every((wait, at) => at === 0 || wait <= waits[at - 1])).toBe(true)
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(GROUND_GUN.autoShoot.manualWaitFloorTicks)
  })

  it("holds auto while the trip's income cap is used up", () => {
    const session = gunWith([STEAM_SEAR_ITEM_ID], 6)
    const trip = incomeTripOf(session.state(), PLAYER)
    const full = withSection(session.state(), PLAYER, EXTRACTION_TRIP_SECTION, {
      ...trip,
      incomeItemValue: '120',
      tripCap: '120',
    })
    expect(boreAutoShootOf(full, PLAYER)?.isIncomeCapUsed).toBe(true)
  })
})

describe('ground-gun: the gimbal sight (ticket 318)', () => {
  it('looks again every 30 ticks as bought, never faster than the 15-tick pick budget', () => {
    expect(sightRetargetTicksAt(1)).toBe(30)
    const ticks = Array.from({ length: 30 }, (_, at) => sightRetargetTicksAt(at + 1))
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(15)
  })
})
