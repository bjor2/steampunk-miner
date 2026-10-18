import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState, vehicleOf } from '../../systems/authority/authorityState'
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  continueScriptedSession,
  dockInBay,
  GROUND,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../systems/authority/stateDigest'
import { UPGRADE_IDS } from '../../systems/economy/economyDefinition'
import { onCurveStep } from '../../systems/economy/vehicleStats'
import { cmp, fromCanonical, ZERO_MONEY, type Money } from '../../systems/money'
import { setPlanetCommand } from '../../systems/startScenarioCommands'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { cellDensitySum } from '../../systems/world/cellYield'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { planetParamsFor } from '../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../systems/world/tileGrid'
import { incomeTripOf, tripCapAt } from '../extraction'
import { CHOOSE_FORK_COMMAND, FORK_TIER } from '../tech-tree'
import { LODESTONE_BEACON_ID } from './systems/lodestoneBeacon'
import { ORE_SHIFTER_ID } from './systems/oreShifter'
import { PRESSURE_POCKET_ID } from './systems/pressurePocket'
import {
  buriedTile,
  commandsOf,
  ofType,
  press,
  replayedAtEveryRate,
  sessionWith,
  standAt,
  standIntents,
  type TimedIntent,
} from './terrainTestSession'

// The movers' trip ledger (ticket 408; Systems ruling 6167240683 on #385, GD ruling on #212 Q2
// (a)): the ore a shifter drags, a pocket lance pushes out or a lodestone gathers is banked on the
// income trip the mineral drain shares, so no trip banks more than `tripCapAt` of mover value. The
// trip ends at the dock, rides in the save, and the drill's own cargo never passes through it.

/** Planet 1 opens two power-up slots. */
const MOVERS = { 'powerup.1': ORE_SHIFTER_ID, 'powerup.2': PRESSURE_POCKET_ID }
const SHIFTER_AND_BEACON = { 'powerup.1': ORE_SHIFTER_ID, 'powerup.2': LODESTONE_BEACON_ID }
const PLAYER = 'p1'
/** Stands down one column, in the planet-1 band the shallow pockets share. */
const STAND_DEPTHS = [8, 10, 12, 14, 16, 18]
/** Past the shifter's 600-tick and the lance's 480-tick cooldowns, so each stand uses both. */
const STAND_TICKS = 620
const FIRST_STAND_TICK = 5
const HEAVY_TRIP_END = FIRST_STAND_TICK + STAND_DEPTHS.length * STAND_TICKS + 40
/** The wind-up, then the queue's ticks for a corner edit. */
const SETTLED = 20
const DRILL_TICKS = 120
/** Wide is the drill-gear lane's flank branch (ticket 268), chosen at its P16 fork. */
const WIDE = { lane: 'drill-gear', branch: 'wide' }
const FORK_SEED = 83921
const PARAMS_16 = planetParamsFor(FORK_SEED, FORK_TIER)
const TARGET_16: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS_16.radiusTiles) - 1 }

function refill(itemId: string): CommandIntent {
  return {
    type: 'debug.power-up-core.setCharges',
    payload: { itemId, chargesLeft: 2 },
  } as CommandIntent
}

/** At each stand the shifter and the pocket lance refilled and each used once. */
function heavyMoverTrip(): TimedIntent[] {
  return [
    [0, setVehicleLoadoutCommand(MOVERS)],
    [1, poseAbove(GROUND, FACING.right)],
    ...STAND_DEPTHS.flatMap((depth, index) =>
      usesAt(FIRST_STAND_TICK + index * STAND_TICKS, buriedTile(depth)),
    ),
  ]
}

function usesAt(tick: number, tile: TilePoint): TimedIntent[] {
  return [
    ...standIntents(tick, tile, FACING.right),
    [tick + 1, refill(ORE_SHIFTER_ID)],
    [tick + 1, refill(PRESSURE_POCKET_ID)],
    [tick + 5, press('powerup.1')],
    [tick + 15, press('powerup.2')],
  ]
}

function bankedOf(state: AuthorityState): Money {
  return fromCanonical(incomeTripOf(state, PLAYER).incomeItemValue)
}

function isFresh(state: AuthorityState): boolean {
  return cmp(bankedOf(state), ZERO_MONEY) === 0
}

/** The trip cap of the band round `tile` for the player's hold. */
function capAt(state: AuthorityState, tile: TilePoint): Money {
  const capacity = statsOfVehicle(vehicleOf(state, PLAYER)).cargoCapacity
  return tripCapAt(PARAMS.planetIndex, bandOfTile(PARAMS, tile.tx, tile.ty), capacity)
}

function refusalsOf(events: readonly DomainEvent[], reason: string): DomainEvent[] {
  return ofType(events, 'power-up-core.PowerUpRefused').filter(
    (event) => 'reason' in event && event.reason === reason,
  )
}

/** A shifter used from a pocket `depth` tiles down, `slots` loaded. */
function shiftedAt(
  depth: number,
  slots: Readonly<Record<string, string>> = MOVERS,
): { session: ScriptedSession; stand: TilePoint } {
  const session = sessionWith(slots)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  session.submit(10, press('powerup.1'))
  session.advanceTo(10 + SETTLED)
  return { session, stand }
}

/** `p1` on planet 16 with the on-curve vehicle and the drill-gear lane's Wide branch chosen. */
function wideSessionOnForkPlanet(): ScriptedSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: FORK_SEED, playerIds: [PLAYER] })
  const session = continueScriptedSession(start)
  const setup: CommandIntent[] = [
    setPlanetCommand(FORK_TIER),
    { type: 'debug.setMoney', payload: { amount: '1e30' } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, onCurveStep(id, FORK_TIER))),
    { type: CHOOSE_FORK_COMMAND, payload: WIDE } as CommandIntent,
  ]
  setup.forEach((intent) => session.submit(0, intent))
  return session
}

/** The columns either side of the bit, from the miner's row four rows down. */
function flankTilesOf(target: TilePoint): TilePoint[] {
  const rows = [1, 0, -1, -2, -3]
  return [-1, 1].flatMap((dx) => rows.map((dy) => ({ tx: target.tx + dx, ty: target.ty + dy })))
}

describe('mover trip ledger', () => {
  it('banks the ore a shifter drags on the trip, held to the cap of its band', () => {
    const { session, stand } = shiftedAt(8)
    const trip = incomeTripOf(session.state(), PLAYER)
    expect(cmp(bankedOf(session.state()), ZERO_MONEY)).toBe(1)
    expect(fromCanonical(trip.tripCap)).toEqual(capAt(session.state(), stand))
  })

  it('banks at most tripCapAt of mover value on a trip of heavy mover use, at any frame rate', () => {
    const runs = replayedAtEveryRate(commandsOf(heavyMoverTrip()), HEAVY_TRIP_END)
    const stands = STAND_DEPTHS.map((depth) => buriedTile(depth))
    const bands = new Set(stands.map((tile) => bandOfTile(PARAMS, tile.tx, tile.ty)))
    expect(bands.size).toBe(1)
    for (const run of runs) {
      const edits = ofType(run.events, 'terrain-tools.TerrainEdited')
      expect(edits.length).toBeGreaterThanOrEqual(STAND_DEPTHS.length)
      expect(cmp(bankedOf(run.state), ZERO_MONEY)).toBe(1)
      expect(cmp(bankedOf(run.state), capAt(run.state, stands[0]))).toBeLessThanOrEqual(0)
      expect(refusalsOf(run.events, 'terrain-tools.trip_capped').length).toBeGreaterThan(0)
    }
    expect(runs[1].digests).toEqual(runs[0].digests)
    expect(runs[2].digests).toEqual(runs[0].digests)
    expect(incomeTripOf(runs[1].state, PLAYER)).toEqual(incomeTripOf(runs[0].state, PLAYER))
  })

  it('ends the trip at the dock', () => {
    const { session } = shiftedAt(8)
    dockInBay(session, 40, 'sell')
    session.advanceTo(42)
    expect(isFresh(session.state())).toBe(true)
  })

  it('banks a lodestone gather on the trip its dock starts, under the cap of its band', () => {
    const { session, stand } = shiftedAt(12, SHIFTER_AND_BEACON)
    session.submit(32, press('powerup.2'))
    session.advanceTo(40)
    dockInBay(session, 50, 'sell')
    session.advanceTo(70)
    expect(ofType(session.events(), 'terrain-tools.TerrainEdited')).toHaveLength(2)
    // The dock empties the shifter's trip first, so all the trip holds now is the gather's ore.
    const gathered = bankedOf(session.state())
    expect(cmp(gathered, ZERO_MONEY)).toBe(1)
    expect(cmp(gathered, capAt(session.state(), stand))).toBeLessThanOrEqual(0)
  })

  it('keeps the trip across a save and load, and plays on to the same state', () => {
    const { session, stand } = shiftedAt(8)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(incomeTripOf(loaded.state, PLAYER)).toEqual(incomeTripOf(session.state(), PLAYER))
    const resumed = continueScriptedSession(loaded.state)
    for (const run of [session, resumed]) {
      standAt(run, 40, stand, FACING.right)
      run.submit(45, press('powerup.2'))
      run.advanceTo(45 + SETTLED)
    }
    expect(incomeTripOf(resumed.state(), PLAYER)).toEqual(incomeTripOf(session.state(), PLAYER))
    expect(stateDigest(resumed.state())).toBe(stateDigest(session.state()))
  })

  it('leaves the trip as the shifter left it while the drill mines below the stand', () => {
    const { session, stand } = shiftedAt(8)
    const banked = bankedOf(session.state())
    const below = { tx: stand.tx, ty: stand.ty - 1 }
    session.submit(40, poseAbove(below, FACING.down))
    session.submit(40 + DRILL_TICKS, poseAbove(below, FACING.down, { drillTicks: DRILL_TICKS }))
    expect(ofType(session.events(), 'CargoAdded').length).toBeGreaterThan(0)
    expect(bankedOf(session.state())).toEqual(banked)
  })

  it("never banks the drill's cargo on the trip, Wide's flank cells included", () => {
    const session = wideSessionOnForkPlanet()
    const flanks = flankTilesOf(TARGET_16)
    const densityOf = (tile: TilePoint) => cellDensitySum(session.state().world, PARAMS_16, tile)
    const flanksBefore = flanks.map(densityOf)
    session.submit(1, poseAbove(TARGET_16, FACING.down))
    session.submit(1 + DRILL_TICKS, poseAbove(TARGET_16, FACING.down, { drillTicks: DRILL_TICKS }))
    expect(flanks.some((tile, index) => densityOf(tile) < flanksBefore[index])).toBe(true)
    expect(isFresh(session.state())).toBe(true)
  })
})
