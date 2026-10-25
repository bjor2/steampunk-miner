import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  continueScriptedSession,
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { cargoUnitsOf, EMPTY_CARGO, type Cargo } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { dropContainerIntent, pickupContainerIntent } from './containerRules'
import { placedContainersIn } from './containerSection'
import { heldCountOf } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'
import { containedUnitsOf, containersOn } from './placedContainers'

// The Cache Crate's host commands (ticket 823, the TD's final ruling on #823): drop and pickup on
// the authority, with the scenario call to place a container, through save, load and a jump. A
// drop spends a carried crate (ticket 850).

const CRATE = 'cache_crate'
const P1 = '1:1'
const HOLD: Cargo = { ore: { '1': 3n, '2': 2n }, coreFragments: 1 }

const setMoney = { type: 'debug.setMoney', payload: { amount: '1e6' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const undock = { type: 'undock', payload: {} } as const
const buyFuel = { type: 'buyFuel', payload: { units: 10 } } as const
const grantCrate = { type: 'debug.planet-kit.grantKitItem', payload: { itemId: CRATE } } as const
const jumpTo = (planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system: '1', planet } }) as const

function placeAt(cell: TilePoint, cargo: Cargo, ownerId = 'p1') {
  return {
    type: 'debug.planet-kit.placeContainer',
    payload: {
      kind: CRATE,
      ownerId,
      tx: cell.tx,
      ty: cell.ty,
      ore: Object.fromEntries(Object.entries(cargo.ore).map(([tier, n]) => [tier, String(n)])),
      coreFragments: cargo.coreFragments,
    },
  } as const
}

function vehicleCell(session: ScriptedSession, playerId = 'p1'): TilePoint {
  return tileOfPose(session.vehicle(playerId).pose as VehiclePose)
}

/**
 * A session whose players each hold `HOLD` and carry one crate, set up through the scenario calls
 * and a pickup.
 */
function sessionWithHolds(playerIds: readonly string[] = ['p1']): ScriptedSession {
  const session = createScriptedSession(playerIds)
  playerIds.forEach((playerId) => {
    session.submit(1, placeAt(vehicleCell(session, playerId), HOLD, playerId), playerId)
    const [container] = containersOn(placedContainersIn(session.state()), P1)
    session.submit(1, pickupContainerIntent(container.containerId), playerId)
    session.submit(1, grantCrate, playerId)
  })
  return session
}

function rejectionOf(events: readonly DomainEvent[]): string | null {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  return rejected?.type === 'CommandRejected' ? rejected.reason : null
}

/** Every unit in every hold and every container: what a drop or pickup may never change. */
function cargoTotalOf(state: AuthorityState): bigint {
  const held = Object.values(state.players).reduce(
    (total, player) => total + cargoUnitsOf(player.vehicle.cargo),
    0n,
  )
  return held + containedUnitsOf(placedContainersIn(state))
}

function savedAndLoaded(session: ScriptedSession): ScriptedSession {
  const text = JSON.stringify(takeSnapshot(session.state()))
  const restored = readSnapshot(JSON.parse(text) as SessionSnapshot)
  if (!('state' in restored)) throw new Error(restored.problems.join('\n'))
  return continueScriptedSession(restored.state)
}

describe('cache crate commands (ticket 823)', () => {
  it('moves a scenario container’s cargo into the hold and removes the emptied container', () => {
    const session = sessionWithHolds()
    expect(session.vehicle().cargo).toEqual(HOLD)
    expect(placedContainersIn(session.state())).toEqual({
      [P1]: { nextContainerId: 2, byId: {} },
    })
  })

  it('drops the whole hold as a crate at the vehicle’s cell and logs what it holds', () => {
    const session = sessionWithHolds()
    const events = session.submit(2, dropContainerIntent(CRATE))
    expect(session.vehicle().cargo).toEqual(EMPTY_CARGO)
    const [crate] = containersOn(placedContainersIn(session.state()), P1)
    expect(crate).toMatchObject({ containerId: 2, kind: CRATE, ownerId: 'p1', access: 'owner' })
    expect(crate.cell).toEqual(vehicleCell(session))
    expect(crate.cargo).toEqual(HOLD)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'planet-kit.ContainerDropped',
        playerId: 'p1',
        system: '1',
        place: '1',
        containerId: 2,
        units: 6n,
      }),
    )
  })

  it('keeps the cargo total through drop, save, load, a jump away and back, and pickup', () => {
    let session = sessionWithHolds()
    const total = cargoTotalOf(session.state())
    session.submit(2, dropContainerIntent(CRATE))
    expect(cargoTotalOf(session.state())).toBe(total)
    session = savedAndLoaded(session)
    session.submit(3, setMoney)
    session.submit(4, dock)
    session.submit(5, buyFuel)
    session.submit(6, jumpTo('2'))
    expect(session.state().planet.index).toBe(2)
    expect(cargoTotalOf(session.state())).toBe(total)
    session.submit(7, jumpTo('1'))
    session.submit(8, undock)
    const events = session.submit(9, pickupContainerIntent(2))
    expect(rejectionOf(events)).toBeNull()
    expect(session.vehicle().cargo).toEqual(HOLD)
    expect(cargoTotalOf(session.state())).toBe(total)
    expect(containersOn(placedContainersIn(session.state()), P1)).toEqual([])
  })

  it('refuses a pickup by another player while the crate is its owner’s, changing nothing', () => {
    const session = sessionWithHolds(['p1', 'p2'])
    session.submit(2, dropContainerIntent(CRATE), 'p1')
    const before = stateDigest(session.state())
    const events = session.submit(3, pickupContainerIntent(3), 'p2')
    expect(rejectionOf(events)).toBe('planet-kit.not_allowed')
    expect(stateDigest(session.state())).toBe(before)
  })

  it('keeps the cargo total in a two-player host run where both drop and pick up', () => {
    const session = sessionWithHolds(['p1', 'p2'])
    const total = cargoTotalOf(session.state())
    session.submit(2, dropContainerIntent(CRATE), 'p1')
    session.submit(2, dropContainerIntent(CRATE), 'p2')
    expect(session.vehicle('p1').cargo).toEqual(EMPTY_CARGO)
    expect(session.vehicle('p2').cargo).toEqual(EMPTY_CARGO)
    expect(cargoTotalOf(session.state())).toBe(total)
    const owners = containersOn(placedContainersIn(session.state()), P1).map((c) => c.ownerId)
    expect(owners).toEqual(['p1', 'p2'])
    session.submit(3, pickupContainerIntent(4), 'p2')
    session.submit(3, pickupContainerIntent(3), 'p1')
    expect(session.vehicle('p1').cargo).toEqual(HOLD)
    expect(session.vehicle('p2').cargo).toEqual(HOLD)
    expect(cargoTotalOf(session.state())).toBe(total)
  })

  it('refuses a 4th crate on one planet, keeping the hold and the carried crate', () => {
    const session = sessionWithHolds()
    const cell = vehicleCell(session)
    for (let crate = 0; crate < 3; crate += 1) session.submit(2, placeAt(cell, HOLD))
    const events = session.submit(3, dropContainerIntent(CRATE))
    expect(rejectionOf(events)).toBe('planet-kit.container_cap')
    expect(session.vehicle().cargo).toEqual(HOLD)
    expect(heldCountOf(kitHoldingsOf(session.state(), 'p1'), CRATE)).toBe(1n)
  })

  it('spends one carried crate on a drop and refuses a drop with none carried, changing nothing', () => {
    const session = sessionWithHolds()
    session.submit(2, dropContainerIntent(CRATE))
    expect(heldCountOf(kitHoldingsOf(session.state(), 'p1'), CRATE)).toBe(0n)
    session.submit(3, pickupContainerIntent(2))
    const before = stateDigest(session.state())
    expect(rejectionOf(session.submit(4, dropContainerIntent(CRATE)))).toBe('planet-kit.no_crate')
    expect(stateDigest(session.state())).toBe(before)
  })

  it('refuses a scenario container past the cap too, never trimming the scenario', () => {
    const session = createScriptedSession()
    const cell = vehicleCell(session)
    for (let crate = 0; crate < 3; crate += 1) session.submit(1, placeAt(cell, HOLD))
    expect(rejectionOf(session.submit(2, placeAt(cell, HOLD)))).toBe('planet-kit.container_cap')
  })

  it('refuses to drop an empty hold or a kind with no cap row', () => {
    const session = createScriptedSession()
    session.submit(1, grantCrate)
    expect(rejectionOf(session.submit(1, dropContainerIntent(CRATE)))).toBe('planet-kit.empty_hold')
    expect(rejectionOf(session.submit(1, dropContainerIntent('stash')))).toBe(
      'planet-kit.unknown_kind',
    )
  })

  it('refuses a pickup out of the drill’s reach of the vehicle', () => {
    const session = createScriptedSession()
    const cell = vehicleCell(session)
    session.submit(1, placeAt({ tx: cell.tx + 5, ty: cell.ty }, HOLD))
    expect(rejectionOf(session.submit(2, pickupContainerIntent(1)))).toBe('planet-kit.out_of_reach')
  })

  it('refuses scenario cargo that is not whole units per ore tier', () => {
    const session = createScriptedSession()
    const bad = {
      ...placeAt(vehicleCell(session), HOLD),
      payload: { ...placeAt(vehicleCell(session), HOLD).payload, ore: { '0': '2', '3': '1.5' } },
    }
    expect(rejectionOf(session.submit(1, bad))).toBe('planet-kit.bad_cargo')
  })

  it('leaves a session with no container out of the state, so its digest is unchanged', () => {
    const session = createScriptedSession()
    expect(session.state().slices?.['planet-kit.containers']).toBeUndefined()
  })
})
