import { describe, expect, it } from 'vitest'
import type { UpgradeId } from '../economy/economyDefinition'
import { stepOfLevel } from '../economy/upgradeSteps'
import { FACING, dockedPoseAt } from '../vehicle/vehiclePose'
import { NO_DRIVE } from '../vehicle/driveSigns'
import type { AuthorityState } from './authorityState'
import type { DomainEvent } from './domainEvent'
import { jumpRefusal } from './starMap/jumpRules'
import {
  coreTiles,
  createScriptedSession,
  drill,
  FREEZE_ENEMIES,
  poseAbove,
  SITE,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'

const setUpgrade = (upgradeId: UpgradeId, level: number) =>
  ({
    type: 'debug.setUpgrade',
    payload: { upgradeId, level: stepOfLevel(upgradeId, level) },
  }) as const
const setMoney = { type: 'debug.setMoney', payload: { amount: '1e9' } } as const
const setCore = (count: number) => ({ type: 'debug.setCoreFragments', payload: { count } }) as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const undock = { type: 'undock', payload: {} } as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const jumpTo = (planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system: '1', planet } }) as const
const travelTo = (toPlanet: number) => ({ type: 'travel', payload: { toPlanet } }) as const

const poseAtDock = {
  type: 'reportPose',
  payload: {
    ...dockedPoseAt(SITE),
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
    drive: NO_DRIVE,
  },
} as const

/** Planet 1's core needs 63 fragments (seed 83921, as the pacing seeds). */
const PLANET_1_NEED = 63

/** Tip 7 and power 33 break a planet-1 core tile in a few ticks; enemies frozen (coreHarvest.test). */
function equippedSession(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setMoney)
  session.submit(0, setUpgrade('drill_tip', 7))
  session.submit(0, setUpgrade('drill_power', 33))
  session.submit(0, setUpgrade('cargo_hold', 60))
  return session
}

/** Mines `count` planet-1 core tiles from `tick`, brings the vehicle home and docks it. */
function mineCoreAndDock(session: ScriptedSession, tick: number, count: number): number {
  coreTiles(count).forEach((tile, index) => {
    session.submit(tick + 50 * index, poseAbove(tile, FACING.down))
    session.submit(tick + 50 * index + 40, drill(tile, 40))
  })
  const home = tick + 50 * count
  session.submit(home, poseAtDock)
  session.submit(home, dock)
  return home + 1
}

/**
 * Buys the hop's fuel at the dock and jumps, the tank empty again on landing: 5 units to a
 * neighbour, a quarter of U0 more per planet crossed (ticket 756). The vehicle lands docked.
 */
function jump(session: ScriptedSession, tick: number, planet: string): DomainEvent[] {
  const crossed = Math.abs(Number(planet) - session.state().planet.index) - 1
  session.submit(tick, buyFuel(5 + crossed))
  return session.submit(tick + 1, jumpTo(planet))
}

/** Leaves the dock and docks again: the dock a bay total is judged on. */
function redock(session: ScriptedSession, tick: number): DomainEvent[] {
  session.submit(tick, undock)
  session.submit(tick + 1, poseAtDock)
  return session.submit(tick + 1, dock)
}

/** Every planet's bay summed: the campaign total is never a counter of its own (HS on #790). */
function fragmentsBankedOf(state: AuthorityState): number {
  const away = Object.values(state.platform.awayCoreBays ?? {})
  return away.reduce((total, bay) => total + bay.fragments, state.platform.coreBay)
}

const coreCompletions = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CoreCompleted')

describe('per-planet core bay (ticket 790)', () => {
  it('lands a jump with the new planet bay empty, so docking there does not complete its core', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, PLANET_1_NEED + 2)
    expect(coreCompletions(session.events())).toHaveLength(1)
    jump(session, tick, '2')
    expect(session.state().platform.coreBay).toBe(0)
    expect(session.state().core.isCompleted).toBe(false)
    expect(coreCompletions(redock(session, tick + 10))).toEqual([])
    expect(session.state().core.isCompleted).toBe(false)
  })

  it('counts fragments banked on a planet toward that planet alone', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, 10)
    jump(session, tick, '2')
    expect(session.state().platform.coreBay).toBe(0)
    session.submit(tick + 5, setCore(5))
    jump(session, tick + 10, '1')
    expect(session.state().platform.coreBay).toBe(10)
    jump(session, tick + 20, '2')
    expect(session.state().platform.coreBay).toBe(5)
    expect(session.state().platform.awayCoreBays).toEqual({
      '1:1': { fragments: 10, isCompleted: false },
    })
  })

  it('keeps a left planet bay through a jump away and back, its core never credited twice', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, PLANET_1_NEED + 2)
    const banked = fragmentsBankedOf(session.state())
    jump(session, tick, '3')
    jump(session, tick + 10, '1')
    expect(session.state().platform.coreBay).toBe(PLANET_1_NEED + 2)
    expect(session.state().core.isCompleted).toBe(true)
    expect(coreCompletions(redock(session, tick + 20))).toEqual([])
    expect(coreCompletions(session.events())).toHaveLength(1)
    expect(fragmentsBankedOf(session.state())).toBe(banked)
  })

  it('never completes a core again after Travel spent its fragments and a jump went back', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, PLANET_1_NEED + 2)
    session.submit(tick, travelTo(2))
    jump(session, tick + 10, '1')
    expect(session.state().platform.coreBay).toBe(2)
    expect(session.state().core.isCompleted).toBe(true)
    expect(coreCompletions(redock(session, tick + 20))).toEqual([])
  })

  it('stores no bay for a planet left with nothing banked and no core', () => {
    const session = equippedSession()
    session.submit(5, dock)
    jump(session, 10, '2')
    expect('awayCoreBays' in session.state().platform).toBe(false)
  })

  it('carries the left planets bays through a snapshot and restore', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, 10)
    jump(session, tick, '2')
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    expect(restored.state).toEqual(session.state())
  })

  it('refuses a snapshot whose away bay is empty or keyed by anything but s:p', () => {
    const session = equippedSession()
    const tick = mineCoreAndDock(session, 10, 10)
    jump(session, tick, '2')
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    snapshot.state.platform.awayCoreBays = {
      '1:1': { fragments: 0, isCompleted: false },
      p7: { fragments: 3, isCompleted: false },
    }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.state.platform.awayCoreBays["1:1"] holds no fragments and no completed core, so it must be left out',
      'snapshot.state.platform.awayCoreBays key "p7" is not a planet\'s s:p',
    ])
  })
})

describe('early jump guard (ticket 790)', () => {
  it('still jumps ahead with the core unharvested whenever the fuel is affordable', () => {
    const session = equippedSession()
    session.submit(5, dock)
    session.submit(6, buyFuel(9))
    expect(session.state().platform.coreBay).toBe(0)
    expect(jumpRefusal(session.state(), 'p1', { system: 1n, planet: 4n })).toBeNull()
    expect(typesOf(session.submit(7, jumpTo('4')))).toContain('PlanetEntered')
    expect(session.state().planet.index).toBe(4)
  })
})
