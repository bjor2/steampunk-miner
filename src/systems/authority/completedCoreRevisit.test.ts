import { describe, expect, it } from 'vitest'
import type { UpgradeId } from '../economy/economyDefinition'
import { stepOfLevel } from '../economy/upgradeSteps'
import { toCanonical, ZERO_MONEY } from '../money'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, dockedPoseAt } from '../vehicle/vehiclePose'
import { dockSiteOf } from '../world/dockSite'
import type { PlanetParams } from '../world/planetParams'
import type { AuthorityState } from './authorityState'
import { coreNeededOf } from './coreBay'
import type { DomainEvent } from './domainEvent'
import { planetParamsOf } from './planetOfState'
import {
  continueScriptedSession,
  coreTiles,
  createScriptedSession,
  drill,
  FREEZE_ENEMIES,
  poseAbove,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'
import { takeSnapshot } from './sessionSnapshot'

/**
 * Ticket 807 (#801 follow-up, TD done-when amended by Systems): a completed core pays once per
 * planet. Revisiting P2 after its core completed regrows its core tiles (#790, left alone here),
 * but mining them again pays no money, fires no second `CoreCompleted` and keeps the bay completed.
 */

const setUpgrade = (upgradeId: UpgradeId, level: number) =>
  ({
    type: 'debug.setUpgrade',
    payload: { upgradeId, level: stepOfLevel(upgradeId, level) },
  }) as const
const setMoney = { type: 'debug.setMoney', payload: { amount: '1e9' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const undock = { type: 'undock', payload: {} } as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const jumpTo = (planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system: '1', planet } }) as const

/** Strong enough gear that a planet-2 core tile breaks inside one 40-tick drill, enemies frozen. */
function equippedSession(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setMoney)
  session.submit(0, setUpgrade('drill_tip', 7))
  session.submit(0, setUpgrade('drill_power', 33))
  session.submit(0, setUpgrade('cargo_hold', 60))
  session.submit(0, dock)
  return session
}

function sessionParams(session: ScriptedSession): PlanetParams {
  const params = planetParamsOf(session.state().planet)
  if (params === null) throw new Error('the session planet has no world')
  return params
}

function poseAtDockOf(params: PlanetParams) {
  return {
    type: 'reportPose',
    payload: {
      ...dockedPoseAt(dockSiteOf(params)),
      driving: false,
      thrusting: false,
      drilling: false,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
      drive: NO_DRIVE,
    },
  } as const
}

/** Buys a neighbour hop's fuel at the dock and jumps; the vehicle lands docked (ticket 756). */
function jump(session: ScriptedSession, tick: number, planet: string): number {
  session.submit(tick, buyFuel(5))
  session.submit(tick + 1, jumpTo(planet))
  return tick + 2
}

/**
 * Undocks, mines as many of the session planet's core tiles as its core needs, brings the vehicle
 * home and docks: one harvest try. Returns the try's events and the next free tick.
 */
function harvestCore(session: ScriptedSession, tick: number) {
  const params = sessionParams(session)
  const tiles = coreTiles(coreNeededOf(session.state().planet) ?? 0, params)
  const before = session.events().length
  session.submit(tick, undock)
  tiles.forEach((tile, index) => {
    session.submit(tick + 1 + 50 * index, poseAbove(tile, FACING.down))
    session.submit(tick + 41 + 50 * index, drill(tile, 40))
  })
  const home = tick + 1 + 50 * tiles.length
  session.submit(home, poseAtDockOf(params))
  session.submit(home, dock)
  return { events: session.events().slice(before), next: home + 1 }
}

const walletOf = (session: ScriptedSession) => session.state().players.p1?.wallet ?? ZERO_MONEY

const coreCompletions = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CoreCompleted')

/** Harvests the P2 core, then jumps to P3 and back to P2: the state the revisit starts from. */
function revisitAfterHarvestingPlanet2() {
  const session = equippedSession()
  const onPlanet2 = jump(session, 10, '2')
  const first = harvestCore(session, onPlanet2)
  const onPlanet3 = jump(session, first.next, '3')
  expect(session.state().planet.index).toBe(3)
  const backOnPlanet2 = jump(session, onPlanet3 + 5, '2')
  return { session, first, tick: backOnPlanet2 }
}

/** Saves the session to a slot file, reads it back through JSON and plays on from it. */
function loadedFromSave(state: AuthorityState): ScriptedSession {
  const file = JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 1)))
  const reading = readSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return continueScriptedSession(reading.state)
}

function expectNoSecondPayout(session: ScriptedSession, tick: number) {
  const walletBefore = toCanonical(walletOf(session))
  const second = harvestCore(session, tick)
  expect(typesOf(second.events)).toContain('CoreBayDeposited')
  expect(coreCompletions(second.events)).toEqual([])
  expect(toCanonical(walletOf(session))).toBe(walletBefore)
  expect(session.state().core.isCompleted).toBe(true)
}

describe('completed core revisit (ticket 807)', () => {
  it('completes the planet-2 core once on the first harvest', () => {
    const { session, first } = revisitAfterHarvestingPlanet2()
    expect(coreCompletions(first.events)).toHaveLength(1)
    expect(session.state().planet.index).toBe(2)
    expect(session.state().core.isCompleted).toBe(true)
  })

  it('pays nothing and fires no second core completion when the revisited planet-2 core is harvested again', () => {
    const { session, tick } = revisitAfterHarvestingPlanet2()
    expectNoSecondPayout(session, tick)
    expect(coreCompletions(session.events())).toHaveLength(1)
  })

  it('pays nothing for the second harvest after the revisit is saved and loaded', () => {
    const { session, tick } = revisitAfterHarvestingPlanet2()
    expectNoSecondPayout(loadedFromSave(session.state()), tick)
  })
})
