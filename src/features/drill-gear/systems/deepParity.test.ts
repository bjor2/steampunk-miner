import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import {
  cutEnergyNumeratorOf,
  energyNumeratorOfLawWork,
  lawWorkRemovedOf,
  tilesAround,
  withDrillExactCarry,
} from '../../../systems/authority/cutCarryFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { drillQuantumAt } from '../../../systems/authority/stepBoundRead'
import {
  continueScriptedSession,
  drill,
  FREEZE_ENEMIES,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { onCurveStep } from '../../../systems/economy/vehicleStats'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { cellStampOf, drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { FACING, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { EMPTY_WORLD, materialCellAt } from '../../../systems/world/worldState'
import { DEEP_BRANCH } from './drillGearFork'

// The GD ruling on #392 (ticket 392): the bot's scripted bore and the player's reported cut share
// one drill-gear path, so with Deep owned the cell past the bit is cut either way at its own drill
// time, on every planet from 1 to 20. The player's report on the per-tick charge
// (`drill.exactCarry` off) pays the drill's energy for exactly the whole ticks the cell past the
// stamp's rim takes. With `drill.exactCarry` on (ticket 535, on since 18 Oct 2026) the report's own
// cut is charged on the density it removed at each cell's law time (the cell past the bit at
// Deep's whole share along the facing), exactly, in the carry's numerator; since ticket 559 the
// bot's bore is charged the same way, the tile past the bored one included, so scripted and
// reported drills charge the same work (Systems on #514), not the same ticks.

const PLAYER = 'p1'
const SEED = 83921
const PLANETS = Array.from({ length: 20 }, (_, index) => index + 1)
/** One drill command long enough to clear any band-1 cell for the on-curve drill. */
const DRILL_TICKS = 120

const FORCE_DEEP = {
  type: 'debug.tech-tree.forceFork',
  payload: { lane: 'drill-gear', branch: DEEP_BRANCH },
} as CommandIntent

/** Player `p1` on `planet` with the on-curve tracks, Deep owned and enemies frozen. */
function deepSessionOn(planet: number) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: [PLAYER] })
  const session = continueScriptedSession(start)
  const setup: CommandIntent[] = [
    setPlanetCommand(planet),
    FREEZE_ENEMIES,
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, onCurveStep(id, planet))),
    FORCE_DEEP,
  ]
  setup.forEach((intent) => session.submit(0, intent))
  return session
}

/** The tile under a miner sunk into the planet's surface, away from the pad. */
function targetOn(planet: number): TilePoint {
  const params = planetParamsFor(SEED, planet)
  return { tx: 20, ty: surfaceRowOfColumn(20, params.radiusTiles) - 1 }
}

/** The drill ticks the gear's cells were charged beyond the bit's own. */
function gearTicksOf(spent: number, events: readonly DomainEvent[]): number {
  const bitTicks = events.reduce(
    (ticks, event) => ticks + (event.type === 'DrillDamageDealt' ? event.ticks : 0),
    0,
  )
  return spent / ENERGY_QUANTA_PER_TICK.drill - bitTicks
}

/** What a gear cut cost, and the cell past the bit it reached. */
interface GearCut {
  gearTicks: number
  aheadTile: TilePoint
}

/** The bot's bore: a report facing down, then `drillTile` of the target, charged on law work. */
function botBoreOn(planet: number): ReportedCut {
  const session = deepSessionOn(planet)
  const target = targetOn(planet)
  session.submit(1, poseAbove(target, FACING.down))
  const before = session.state()
  session.submit(1 + DRILL_TICKS, drill(target, DRILL_TICKS))
  const pose = session.vehicle().pose as VehiclePose
  const [aheadTile] = drillGearCellsAt(pose, cellStampOf(target), {
    aheadCells: 1,
    sideCells: 0,
  }).ahead
  return chargedCutOf(before, session.state(), target, aheadTile)
}

/** What the drill charged from `before` to `after`, the law work it removed, and the cell past the bit. */
function chargedCutOf(
  before: AuthorityState,
  after: AuthorityState,
  target: TilePoint,
  aheadTile: TilePoint,
): ReportedCut {
  const params = planetParamsFor(SEED, before.planet.index)
  const quantum = drillQuantumAt(before, PLAYER)
  const removed = lawWorkRemovedOf(before, after.world, tilesAround(target, 3), PLAYER, quantum)
  return {
    charged: cutEnergyNumeratorOf(before.players[PLAYER].vehicle, after.players[PLAYER].vehicle),
    lawWorkCharge: energyNumeratorOfLawWork(removed),
    aheadRemoved:
      cellDensitySum(before.world, params, aheadTile) -
      cellDensitySum(after.world, params, aheadTile),
    aheadTile,
  }
}

/** What a report's cut charged in the carry's numerator, the law work it removed, and the cell past the bit. */
interface ReportedCut {
  charged: number
  lawWorkCharge: number
  aheadRemoved: number
  aheadTile: TilePoint
}

/** The player's cut on the per-tick charge (`drill.exactCarry` off, as before ticket 535): a report facing down with the drill running over the target. */
function playerCutOn(planet: number): GearCut {
  return withDrillExactCarry(false, () => playerCutOnTickCharge(planet))
}

function playerCutOnTickCharge(planet: number): GearCut {
  const session = deepSessionOn(planet)
  const target = targetOn(planet)
  session.submit(1, poseAbove(target, FACING.down))
  const before = session.vehicle().energy
  const report = poseAbove(target, FACING.down, { drillTicks: DRILL_TICKS })
  const events = session.submit(1 + DRILL_TICKS, report)
  const pose = session.vehicle().pose as VehiclePose
  const stamp = drillStampOf(pose, false)
  const [aheadTile] = drillGearCellsAt(pose, stamp, { aheadCells: 1, sideCells: 0 }).ahead
  return { gearTicks: gearTicksOf(before - session.vehicle().energy, events), aheadTile }
}

/** The same cut with `drill.exactCarry` on: what it charged, the law work it removed, the cell past the bit. */
function playerChargedCutOn(planet: number): ReportedCut {
  return withDrillExactCarry(true, () => {
    const session = deepSessionOn(planet)
    const target = targetOn(planet)
    session.submit(1, poseAbove(target, FACING.down))
    const before = session.state()
    const report = poseAbove(target, FACING.down, { drillTicks: DRILL_TICKS })
    session.submit(1 + DRILL_TICKS, report)
    const pose = session.vehicle().pose as VehiclePose
    const stamp = drillStampOf(pose, false)
    const [aheadTile] = drillGearCellsAt(pose, stamp, { aheadCells: 1, sideCells: 0 }).ahead
    return chargedCutOf(before, session.state(), target, aheadTile)
  })
}

/**
 * The ticks the on-curve drill of `planet` takes to break `tile`, on the session's own planet: its
 * ore rules stamp carries the surface layer (ticket 625), which the unstamped params lack.
 */
function ownTicksOf(planet: number, tile: TilePoint): number | null {
  const session = deepSessionOn(planet)
  const params = planetParamsOf(session.state().planet) as PlanetParams
  const drillStats = heatThrottledDrill(planet, session.vehicle())
  return ticksPerCell(drillStats, params, tile, materialCellAt(EMPTY_WORLD, params, tile))
}

describe('drill-gear fork: Deep from the bot and the player (GD ruling on #392)', () => {
  it.each(PLANETS)(
    'charges the cell past the bit its own drill ticks on planet %i, cut with drill.exactCarry off',
    (planet) => {
      const player = playerCutOn(planet)
      expect(player.gearTicks).toBe(ownTicksOf(planet, player.aheadTile))
      expect(player.gearTicks).toBeGreaterThan(0)
    },
  )

  it.each(PLANETS)(
    'charges the bore past the bit its own law work on planet %i (ticket 559)',
    (planet) => {
      const bot = botBoreOn(planet)
      expect(bot.aheadRemoved).toBeGreaterThan(0)
      expect(bot.charged).toBe(bot.lawWorkCharge)
    },
  )

  it.each(PLANETS)(
    'charges the cut past the bit its own law work on planet %i with drill.exactCarry on (ticket 535)',
    (planet) => {
      const player = playerChargedCutOn(planet)
      expect(player.aheadRemoved).toBeGreaterThan(0)
      expect(player.charged).toBe(player.lawWorkCharge)
    },
  )
})
