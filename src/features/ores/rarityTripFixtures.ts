/**
 * Spec plumbing for the rarity trip clamp (ticket 509): a planet-3 session entered under the ore
 * rules, mining the epic and mythic cells it generated with a strong drill and the on-curve P3 hold
 * (90 units, the case Systems' model on #139 binds in), so the clamp binds within one trip. The
 * commands are a script, so the same run replays straight and in 30 and 144 fps frames. Only specs
 * use it.
 */
import { poseAbove, drill, FREEZE_ENEMIES } from '../../systems/authority/scriptedSession'
import { minedOreOf } from '../../systems/authority/minedOre'
import { onCurveSteps } from '../../systems/economy/vehicleStats'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import type { ScriptedCommand } from '../../systems/fastForward'
import type { Money } from '../../systems/money'
import type { PickupFind } from '../../systems/registries/orePickup'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { bandOfTile } from '../../systems/world/planetGeometry'
import {
  ORE_RULES_VERSION,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import {
  isTripClamped,
  NEW_RARITY_TRIP,
  paidRarityFind,
  type RarityTrip,
} from './systems/rarityTripClamp'

export const RARITY_RUN_PLANET = 3
/** Band 5, Systems' binding case; of the pinned seeds only 27182's P3 band 5 holds an epic patch. */
export const BAND_5_RUN = { seed: 27182, bands: [5] } as const
/** Every band epic and mythic are live in on P3 (`firstBand` 3 and 4). */
export const CLAMPED_BANDS = [3, 4, 5] as const
/** Enough epic and mythic cells to pass the cap of a 90-unit hold (four epics reach it). */
export const RARITY_RUN_CELLS = 8
/** A drill on the curve of planet 10 breaks a P3 mythic in a tick or two. */
const STRONG_DRILL_PLANET = 10
const DRILL_TICKS = 40

/** A planet as this build enters it from P3: on the mixed rows of the ore rules. */
export function stampedRunParamsOf(seed: number, planetIndex = RARITY_RUN_PLANET): PlanetParams {
  return planetParamsFor(seed, planetIndex, ORE_RULES_VERSION)
}

/** The find the kernel hands the pickup seam for the cell a tile generated. */
export function pickupFindAt(params: PlanetParams, tile: TilePoint): PickupFind {
  const ore = minedOreOf(params, tile, cellAt(EMPTY_WORLD, params, tile))
  const tierAboveBand = ore.resourceTier - oreTier(params.planetIndex, ore.band)
  return { planetIndex: params.planetIndex, band: ore.band, tierAboveBand, saleTier: ore.saleTier }
}

/** The first `count` ore cells in `bands`, from the north pole down, whose lead is epic or mythic. */
export function clampedTilesOf(
  params: PlanetParams,
  count: number,
  bands: readonly number[],
): TilePoint[] {
  const tiles: TilePoint[] = []
  const reach = params.radiusTiles
  for (let ty = reach; ty >= -reach && tiles.length < count; ty--) {
    for (let tx = -reach; tx <= reach && tiles.length < count; tx++) {
      if (isClampedOreIn(params, { tx, ty }, bands)) tiles.push({ tx, ty })
    }
  }
  if (tiles.length < count) throw new Error(`only ${tiles.length} epic or mythic cells`)
  return tiles
}

function isClampedOreIn(params: PlanetParams, tile: TilePoint, bands: readonly number[]): boolean {
  if (!bands.includes(bandOfTile(params, tile.tx, tile.ty))) return false
  if (kindOfCell(cellAt(EMPTY_WORLD, params, tile)) !== CELL_KIND.ore) return false
  return isTripClamped(pickupFindAt(params, tile).tierAboveBand)
}

export interface RarityRunScript {
  worldSeed: number
  endTick: number
  tiles: TilePoint[]
  commands: ScriptedCommand[]
}

/**
 * Planet 3 under the ore rules, a strong drill and the P3 hold, then the first epic and mythic
 * cells of `bands` mined in turn.
 */
export function rarityRunScriptOf(seed: number, bands: readonly number[]): RarityRunScript {
  const tiles = clampedTilesOf(stampedRunParamsOf(seed), RARITY_RUN_CELLS, bands)
  const commands = [...rarityRunSetUp(), ...mineEachTile(tiles)]
  return { worldSeed: seed, endTick: (commands.at(-1)?.tick ?? 0) + 1, tiles, commands }
}

function rarityRunSetUp(): ScriptedCommand[] {
  const steps = onCurveSteps(STRONG_DRILL_PLANET)
  return [
    { tick: 0, type: 'debug.setPlanet', payload: { planetIndex: RARITY_RUN_PLANET } },
    { tick: 0, ...FREEZE_ENEMIES },
    { tick: 0, ...setUpgradeCommand('drill_power', steps.drill_power) },
    { tick: 0, ...setUpgradeCommand('drill_tip', steps.drill_tip) },
    { tick: 0, ...setUpgradeCommand('cargo_hold', onCurveSteps(RARITY_RUN_PLANET).cargo_hold) },
  ] as ScriptedCommand[]
}

function mineEachTile(tiles: readonly TilePoint[]): ScriptedCommand[] {
  return tiles.flatMap((tile, index) => {
    const tick = 1 + index * (DRILL_TICKS + 1)
    return [
      { tick, ...poseAbove(tile, FACING.down) },
      { tick: tick + DRILL_TICKS, ...drill(tile, DRILL_TICKS) },
    ] as ScriptedCommand[]
  })
}

export interface ModelTrip {
  values: Money[]
  trip: RarityTrip
}

/** The ledger model: each find in turn priced by the pure clamp from a fresh trip. */
export function modelTripOf(finds: readonly PickupFind[], cargoCapacity: number): ModelTrip {
  let trip = NEW_RARITY_TRIP
  const values: Money[] = []
  for (const find of finds) {
    const paid = paidRarityFind(trip, { ...find, cargoCapacity })
    values.push(oreSalePrice(paid.saleTier))
    trip = paid.trip
  }
  return { values, trip }
}
