import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS } from '../../../constants/balance'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { ofType } from '../../../systems/authority/charges/chargeFixtures'
import { forceCollapseCommand } from '../../../systems/authority/collapse/collapseCommands'
import {
  BAND_2_Y,
  poseAt,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
  WEAK_TUNNEL_HOLD_TICKS,
} from '../../../systems/authority/collapse/collapseFixtures'
import { weakBlocksNearVehicles } from '../../../systems/authority/collapse/collapseWatch'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { isCellReinforced } from '../../../systems/registries/groundReinforcement'
import { drillStampLiftMm, drillStampRadiusMm } from '../../../systems/vehicle/drillBore'
import type { TilePoint } from '../../../systems/world/tileGrid'

/**
 * A band-2 tunnel cut and lined at grade 1 (band 2 needs 2) with the ground's debug commands, as
 * wide as the drill's own bore (ticket 662: the body plus its clearance): a band-2 dig with the
 * body at y 252.5 m leaves the five air samples from 252.0 to 253.0 m, the last a sample inside the
 * stamp's radius and the next a sample and a half outside it, so the carve reaches a quarter
 * sample past the radius (the collapse fixture's 1.9 m carve is wider than any drill cuts). Each
 * ring is its own command, so a block warns while its far rings are still unlaid. One grade short,
 * its blocks burst 20 s after they warn (ticket 829).
 */
const BUILD_TICK = 10
const DONE_TICK = BUILD_TICK + WEAK_TUNNEL_HOLD_TICKS + COLLAPSE_FILL_TICKS + 5
const BORE_Y = BAND_2_Y + drillStampLiftMm()
const BORE_RADIUS_MM = drillStampRadiusMm() + 25
const WEAK_GRADE = 1
/** The grade band 2 needs on planet 1: a tunnel lined at it never bursts. */
const HOLDING_GRADE = 2

const setLiningType = (liningType: string): CommandIntent => ({
  type: 'debug.setLiningType',
  payload: { liningType },
})

function tunnelAxis(): number[] {
  const count = (TUNNEL_TO_X - TUNNEL_FROM_X) / 500 + 1
  return Array.from({ length: count }, (_, at) => TUNNEL_FROM_X + at * 500)
}

function tunnelIntents(grade: number): CommandIntent[] {
  const axis = tunnelAxis()
  return [
    FREEZE_ENEMIES,
    poseAt((TUNNEL_FROM_X + TUNNEL_TO_X) / 2, BAND_2_Y),
    ...axis.map((x): CommandIntent => ({
      type: 'debug.carveCircle',
      payload: { x, y: BORE_Y, radius: BORE_RADIUS_MM, amount: 255 },
    })),
    ...axis.map((x): CommandIntent => ({
      type: 'debug.lineCasing',
      payload: { x, y: BORE_Y, grade },
    })),
  ]
}

function buildTunnel(session: ScriptedSession, grade = WEAK_GRADE): void {
  tunnelIntents(grade).forEach((intent) => session.submit(BUILD_TICK, intent))
}

/** The tunnel lined in `liningType`, laid by a scenario's lining (owned and selected). */
function tunnelLinedIn(
  liningType: string,
  playerIds: readonly string[] = ['p1'],
  grade = WEAK_GRADE,
): ScriptedSession {
  const session = createScriptedSession(playerIds)
  session.submit(1, setLiningType(liningType))
  buildTunnel(session, grade)
  return session
}

/** The tunnel's open tiles: the bore's row, end to end. */
function tunnelTiles(): TilePoint[] {
  const from = Math.ceil(TUNNEL_FROM_X / 1000)
  const to = Math.floor(TUNNEL_TO_X / 1000) - 1
  const columns = Array.from({ length: to - from + 1 }, (_, at) => from + at)
  return [252].flatMap((ty) => columns.map((tx) => ({ tx, ty })))
}

function reinforcedTunnelTiles(session: ScriptedSession): number {
  const state = session.state()
  return tunnelTiles().filter(({ tx, ty }) => isCellReinforced(state, tx, ty)).length
}

const warningsAfter = (events: readonly DomainEvent[], tick: number) =>
  ofType(events, 'CollapseWarned').filter((warning) => warning.tick > tick)

const rejectionOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'CommandRejected')

describe('casing-cement: cement lining reinforces the ground (ticket 367)', () => {
  it('cases every open tile of a tunnel lined in refractory', () => {
    expect(reinforcedTunnelTiles(tunnelLinedIn('refractory'))).toBe(tunnelTiles().length)
  })

  // Ticket 829: the burst reads the strength grade only; a lining is no strength grade.
  it('lets a refractory-lined tunnel short of its grade burst all the same', () => {
    const session = tunnelLinedIn('refractory')
    session.advanceTo(DONE_TICK)
    expect(weakBlocksNearVehicles(session.state(), PARAMS)).toEqual([])
    expect(ofType(session.events(), 'CollapseWarned').length).toBeGreaterThan(0)
    expect(ofType(session.events(), 'CasingBurst').length).toBeGreaterThan(0)
    expect(reinforcedTunnelTiles(session)).toBeLessThan(tunnelTiles().length)
  })

  it('never warns a forced collapse in a block whose open cells are all cased', () => {
    const standard = tunnelLinedIn('standard')
    const [weak] = ofType(standard.events(), 'CollapseWarned')
    const session = tunnelLinedIn('refractory', ['p1'], HOLDING_GRADE)
    session.submit(BUILD_TICK + 1, forceCollapseCommand(weak.block))
    session.advanceTo(DONE_TICK)
    expect(warningsAfter(session.events(), BUILD_TICK)).toEqual([])
  })

  it('keeps the under-grade hazard of standard lining: the same tunnel warns and refills', () => {
    const session = tunnelLinedIn('standard')
    session.advanceTo(DONE_TICK)
    expect(ofType(session.events(), 'CollapseStarted').length).toBeGreaterThan(0)
    expect(reinforcedTunnelTiles(session)).toBe(0)
  })

  it('holds a cased tile against a forced collapse for every player, owner or not', () => {
    const standard = tunnelLinedIn('standard')
    const [weak] = ofType(standard.events(), 'CollapseWarned')
    const session = tunnelLinedIn('refractory', ['p1', 'p2'], HOLDING_GRADE)
    session.submit(BUILD_TICK + 1, forceCollapseCommand(weak.block), 'p2')
    session.advanceTo(DONE_TICK)
    expect(session.vehicle('p2').lining.owned).toEqual(['standard'])
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
  })
})

describe('casing-cement: ownership is checked on apply (ticket 367)', () => {
  /** On planet 1, docked at the Upgrade bay with money, owning no cement grade. */
  function unownedAtUpgradeBay(): ScriptedSession {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
    session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    return session
  }

  it('refuses an unowned player the cement lining, so nothing it lines reinforces', () => {
    const session = unownedAtUpgradeBay()
    const select = session.submit(2, {
      type: 'selectLiningType',
      payload: { liningType: 'refractory' },
    })
    expect(rejectionOf(select)).toMatchObject({ reason: 'lining_type_not_owned' })
    buildTunnel(session)
    session.advanceTo(DONE_TICK)
    expect(session.vehicle().lining.active).toBe('standard')
    expect(reinforcedTunnelTiles(session)).toBe(0)
    expect(ofType(session.events(), 'CollapseStarted').length).toBeGreaterThan(0)
  })
})
