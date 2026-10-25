import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { createScriptedSession, WORLD_SEED } from '../../../systems/authority/scriptedSession'
import {
  collectCrates,
  dropFullHold,
  restockCrates,
  type KitPolicy,
} from '../../../systems/bot/botCrates'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { botPlanetOf } from '../../../systems/bot/botTravel'
import { runTrip } from '../../../systems/bot/botTrip'
import { newDownBoreTally } from '../../../systems/bot/downBores'
import { shaftTileAt } from '../../../systems/bot/mineLayout'
import { newSidewaysBoreTally } from '../../../systems/bot/sidewaysBores'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { pickupContainerIntent } from './containerRules'
import { placedContainersIn } from './containerSection'
import { heldCountOf } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'
import { containersOn } from './placedContainers'

// The pacing bot's crate policy (ticket 850; the TD's Q4 seam on #850): off by default, so the bare
// bot sends no crate command; under `drop_on_full` it restocks Cache Crates at the planet 1 Sell
// bay, drops a full hold as a crate on an ore trip, and collects its crates when a trip starts.

const CRATE = 'cache_crate'
const P1 = '1:1'
const CRATES_ON: KitPolicy = { crates: 'drop_on_full' }
const ORE_TRIP = { kind: 'ore', band: 1 } as const

const setMoney: CommandIntent = { type: 'debug.setMoney', payload: { amount: '1e6' } }
const grantCrate = {
  type: 'debug.planet-kit.grantKitItem',
  payload: { itemId: CRATE },
} as CommandIntent

function placeCrateAt(cell: TilePoint, units: bigint): CommandIntent {
  return {
    type: 'debug.planet-kit.placeContainer',
    payload: { kind: CRATE, ownerId: 'p1', ...cell, ore: { '1': String(units) }, coreFragments: 0 },
  } as CommandIntent
}

function capacityOf(state: AuthorityState): bigint {
  return statsOfVehicle(state.players.p1.vehicle).cargoCapacity
}

/** The bot on planet 1 at the Sell bay, from `state`, with `kitPolicy` on its pilot. */
function botOn(state: AuthorityState, kitPolicy?: KitPolicy) {
  const session = createBotSession(state, 'p1')
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    'never',
    newSidewaysBoreTally(),
    newDownBoreTally(),
    kitPolicy,
  )
  return { session, planet }
}

/** Docked at the planet 1 Sell bay with money. */
function dockedWithMoney(): AuthorityState {
  const scripted = createScriptedSession()
  scripted.submit(0, setMoney)
  scripted.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return scripted.state()
}

/** A full hold, lifted from a placed crate, and one crate carried. */
function fullHoldCarryingACrate(): AuthorityState {
  const scripted = createScriptedSession()
  const cell = tileOfPose(scripted.vehicle('p1').pose as VehiclePose)
  scripted.submit(1, placeCrateAt(cell, capacityOf(scripted.state())))
  const [placed] = containersOn(placedContainersIn(scripted.state()), P1)
  scripted.submit(1, pickupContainerIntent(placed.containerId))
  scripted.submit(1, grantCrate)
  return scripted.state()
}

function cratesCarried(session: BotSession): bigint {
  return heldCountOf(kitHoldingsOf(session.state(), 'p1'), CRATE)
}

function planetKitCommandsOf(session: BotSession) {
  return session.commands().filter((command) => command.type.startsWith('planet-kit.'))
}

describe('bot: the crate policy (ticket 850)', () => {
  it('buys Cache Crates at the planet 1 Sell bay up to the carry limit under drop_on_full', () => {
    const { session, planet } = botOn(dockedWithMoney(), CRATES_ON)
    restockCrates(session, planet)
    expect(cratesCarried(session)).toBe(3n)
  })

  it('buys no crate under the default policy, sending nothing', () => {
    const { session, planet } = botOn(dockedWithMoney())
    restockCrates(session, planet)
    expect(session.commands()).toEqual([])
  })

  it('drops a full hold as a crate on an ore trip, spending the crate carried', () => {
    const { session, planet } = botOn(fullHoldCarryingACrate(), CRATES_ON)
    dropFullHold(session, planet, ORE_TRIP)
    expect(cratesCarried(session)).toBe(0n)
    expect(session.vehicle().cargo.ore).toEqual({})
    expect(containersOn(placedContainersIn(session.state()), P1)).toHaveLength(1)
  })

  it('keeps a full hold on a core trip, which ends the planet, and under the default policy', () => {
    const onCore = botOn(fullHoldCarryingACrate(), CRATES_ON)
    dropFullHold(onCore.session, onCore.planet, { kind: 'core' })
    const off = botOn(fullHoldCarryingACrate())
    dropFullHold(off.session, off.planet, ORE_TRIP)
    expect(planetKitCommandsOf(onCore.session)).toEqual([])
    expect(planetKitCommandsOf(off.session)).toEqual([])
  })

  it('collects a crate on its way down and carries a hold it fills straight home to sell', () => {
    const start = createAuthorityState({
      planetIndex: 1,
      planetSeed: WORLD_SEED,
      playerIds: ['p1'],
    })
    const { session, planet } = botOn(start, CRATES_ON)
    const capacity = capacityOf(start)
    session.submit(placeCrateAt(shaftTileAt(planet.layout, planet.layout.travelRow), capacity))
    runTrip(session, planet, ORE_TRIP)
    expect(containersOn(placedContainersIn(session.state()), P1)).toEqual([])
    const sold = session.events().find((event) => event.type === 'DockEntered')
    expect(sold).toMatchObject({ bay: 'sell', cargoUnits: capacity })
    expect(session.commands().some((command) => command.type === 'drillTile')).toBe(false)
  })

  it('leaves its crates where they stand under the default policy', () => {
    const start = createAuthorityState({
      planetIndex: 1,
      planetSeed: WORLD_SEED,
      playerIds: ['p1'],
    })
    const { session, planet } = botOn(start)
    session.submit(placeCrateAt(shaftTileAt(planet.layout, planet.layout.travelRow), 5n))
    expect(collectCrates(session, planet)).toBe(false)
    expect(planetKitCommandsOf(session)).toEqual([])
    expect(containersOn(placedContainersIn(session.state()), P1)).toHaveLength(1)
  })
})
