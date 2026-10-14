import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ticksPerCell } from '../../../systems/authority/groundDrill'
import { heatThrottledDrill } from '../../../systems/authority/heatRules'
import {
  continueScriptedSession,
  drill,
  FREEZE_ENEMIES,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../../systems/economy/vehicleStats'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { cellStampOf, drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { FACING, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { EMPTY_WORLD, materialCellAt } from '../../../systems/world/worldState'
import { DEEP_BRANCH } from './drillGearFork'

// The GD ruling on #392 (ticket 392): the bot's scripted bore and the player's reported cut share
// one drill-gear path, so with Deep owned the cell past the bit costs the same ticks either way:
// its own drill time, on every planet from 1 to 20. The bot reaches it as the tile past the bored
// one, the player as the cell past the stamp's rim; each pays the drill's energy for exactly the
// ticks its own hardness takes.

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
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planet)))),
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

/** The bot's bore: a report facing down, then `drillTile` of the target. */
function botBoreOn(planet: number): GearCut {
  const session = deepSessionOn(planet)
  const target = targetOn(planet)
  session.submit(1, poseAbove(target, FACING.down))
  const before = session.vehicle().energy
  const events = session.submit(1 + DRILL_TICKS, drill(target, DRILL_TICKS))
  const pose = session.vehicle().pose as VehiclePose
  const [aheadTile] = drillGearCellsAt(pose, cellStampOf(target), {
    aheadCells: 1,
    sideCells: 0,
  }).ahead
  return { gearTicks: gearTicksOf(before - session.vehicle().energy, events), aheadTile }
}

/** The player's cut: a report facing down with the drill running over the target. */
function playerCutOn(planet: number): GearCut {
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

/** The ticks the on-curve drill of `planet` takes to break `tile`. */
function ownTicksOf(planet: number, tile: TilePoint): number | null {
  const params = planetParamsFor(SEED, planet)
  const drillStats = heatThrottledDrill(planet, deepSessionOn(planet).vehicle())
  return ticksPerCell(drillStats, params, tile, materialCellAt(EMPTY_WORLD, params, tile))
}

describe('drill-gear fork: Deep from the bot and the player (GD ruling on #392)', () => {
  it.each(PLANETS)(
    'charges the cell past the bit its own drill ticks on planet %i, bored or cut',
    (planet) => {
      const bot = botBoreOn(planet)
      const player = playerCutOn(planet)
      expect(bot.gearTicks).toBe(ownTicksOf(planet, bot.aheadTile))
      expect(player.gearTicks).toBe(ownTicksOf(planet, player.aheadTile))
      expect(bot.gearTicks).toBeGreaterThan(0)
    },
  )
})
