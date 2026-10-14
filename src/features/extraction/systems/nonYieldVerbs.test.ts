import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { continueScriptedSession } from '../../../systems/authority/scriptedSession'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import type { FollowUpPattern, PowerUpUse } from '../../power-up-core'
import { lastMarkOf, markStepOf } from '../../tech-tree'
import { DRAIN_ID, DRAIN_REACH_TILES, MM, poseAt } from '../drainTestSession'
import { tilesInReachOf } from './drainReach'
import { EXTRACTION_POWER_UPS } from './extractionContent'
import { extractionItemOf, markLadderOf, type ExtractionItem } from './extractionItems'

// Mark milestones never yield (GD lock on #256, the non-yield checks of ticket 278): the mineral
// drain is an income item, so its Mark 3 second tap changes only where it drains, never the ore or
// the cells of a use. On each pacing seed's planet 1 the drain at its last Mark acts plain and as a
// second tap from the same state, where its reach holds more ore than a use takes, with the hold
// of an on-curve planet-10 vehicle so the trip cap leaves room for a whole use: both take the same
// cells, pay the same units and the same value.

const SEEDS: readonly number[] = PACING_WORLD_SEEDS['bot-slice']
const DRAIN = extractionItemOf(DRAIN_ID) as ExtractionItem
const LADDER = markLadderOf(DRAIN)
const LAST_MARK = lastMarkOf(LADDER)
const CELLS_PER_USE = markStepOf(LADDER, LAST_MARK).stats.magnitude as number
const POCKET_RADIUS_MM = 1200
const FIRST_COLUMN = 12
const LAST_COLUMN = 600
const DEPTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12]
const ACT_TICK = 70

/** One drain's yield line, as `extraction.DrainYielded` logs it. */
interface DrainMeasure {
  cells: number
  units: number
  value: string
}

/** The first tile under the seed's planet-1 surface whose reach holds more ore than a use takes. */
function standOf(seed: number): TilePoint {
  const params = planetParamsFor(seed, 1)
  for (let tx = FIRST_COLUMN; tx <= LAST_COLUMN; tx++) {
    const stand = DEPTHS.map((depth) => tileUnder(params, tx, depth)).find((tile) =>
      hasMoreOreThanAUse(params, tile),
    )
    if (stand !== undefined) return stand
  }
  throw new Error(`seed ${seed}: no planet-1 tile holds ${CELLS_PER_USE + 1} ore in reach`)
}

function tileUnder(params: PlanetParams, tx: number, depth: number): TilePoint {
  return { tx, ty: surfaceRowOfColumn(tx, params.radiusTiles) - depth }
}

function hasMoreOreThanAUse(params: PlanetParams, origin: TilePoint): boolean {
  const ore = tilesInReachOf(origin, DRAIN_REACH_TILES).filter(
    (tile) => !isInPocket(origin, tile) && isGeneratedOre(params, tile),
  )
  return ore.length > CELLS_PER_USE
}

function isInPocket(origin: TilePoint, tile: TilePoint): boolean {
  return Math.abs(tile.tx - origin.tx) <= 1 && Math.abs(tile.ty - origin.ty) <= 1
}

function isGeneratedOre(params: PlanetParams, tile: TilePoint): boolean {
  return kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === CELL_KIND.ore
}

/** The drain's yield when used once as `verb` at its last Mark from the seed's stand. */
function measureDrain(seed: number, verb: FollowUpPattern | null): DrainMeasure {
  const stand = standOf(seed)
  const [drain] = EXTRACTION_POWER_UPS
  const outcome = drain.activate(stateBeforeUse(seed, stand), useOf(stand, verb))
  if (outcome.kind !== 'acted') throw new Error(`seed ${seed}: the drain did not act`)
  return yieldOf(outcome.effect.events)
}

/** The miner at rest in a pocket at `stand` with the drain slotted and a planet-10 hold. */
function stateBeforeUse(seed: number, stand: TilePoint) {
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex: 1, planetSeed: seed, playerIds: ['p1'] }),
  )
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': DRAIN_ID }))
  session.submit(0, setUpgradeCommand('cargo_hold', onCurveSteps(10).cargo_hold))
  const centre = { x: stand.tx * MM + MM / 2, y: stand.ty * MM + MM / 2 }
  session.submit(
    1,
    carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY }),
  )
  session.submit(2, poseAt(stand))
  session.advanceTo(ACT_TICK - 1)
  return session.state()
}

function useOf(stand: TilePoint, verb: FollowUpPattern | null): PowerUpUse {
  return {
    playerId: 'p1',
    itemId: DRAIN_ID,
    slot: 'powerup.1',
    tick: ACT_TICK,
    origin: stand,
    mark: LAST_MARK,
    magnitude: CELLS_PER_USE,
    ...(verb !== null && { milestone: verb }),
  }
}

function yieldOf(events: readonly DomainEvent[]): DrainMeasure {
  const drained = events.find((event) => event.type === 'extraction.DrainYielded')
  if (drained?.type !== 'extraction.DrainYielded') throw new Error('the drain logged no yield')
  return { cells: drained.cells, units: drained.units, value: drained.value }
}

describe('mineral drain Mark milestones never yield (#256, ticket 278)', () => {
  it.each(SEEDS.map((seed) => [seed]))(
    'seed %i: a second tap takes the same cells and pays the same ore as a plain use at the last Mark',
    (seed) => {
      const plain = measureDrain(seed, null)
      expect(plain.cells).toBe(CELLS_PER_USE)
      expect(measureDrain(seed, 'second-tap')).toEqual(plain)
    },
  )
})
