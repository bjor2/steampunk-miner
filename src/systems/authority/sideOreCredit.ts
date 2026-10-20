/**
 * The side ore share (Systems' price rows on #308, the TD shape for ticket 620): an ore cell the
 * side cutters or the gallery reamers opened pays `sideOreShareBp` of its unit, every other opened
 * cell its whole unit. Ore comes in whole units (#7), so the share runs on an integer carry on the
 * vehicle (`sideOreCarryBp`): each side ore cell adds its share, and the cell that brings the carry
 * to a whole unit pays one, its own ore, in the cut's walk order (`yieldedInWalkOrder`). No float,
 * no random draw: the same cut credits the same cells on every machine.
 *
 * The cut itself, its energy and its heat stay per cell as before; only the yield reads the share.
 * A cell a gate loses never reaches here, so it is never credited. Core cells harvest whole.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { sideOreShareOf, type CutCellKind } from '../economy/drillGearCaps'
import { ECONOMY } from '../economy/economy'
import type { VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { GearCellShare } from './drillGearCut'

/** The ore share each opened tile pays, in basis points: a whole one for any tile not listed. */
export type OreShareOf = (tile: TilePoint) => number

/** What one ore cell's share leaves: the vehicle with its carry, and whether the cell pays a unit. */
export interface OreShareCredit {
  vehicle: VehicleState
  isPaid: boolean
}

/** Every tile a whole share; a carve with no gear. */
export const WHOLE_ORE_SHARES: OreShareOf = () => BASIS_POINTS

/** The ore share of each tile the carve opened, by what its gear listed the tile as. */
export function oreSharesOf(gearCells: readonly GearCellShare[]): OreShareOf {
  const kinds = new Map(gearCells.map(({ tx, ty, kind }) => [keyOf({ tx, ty }), kind]))
  return (tile) => sideOreShareOf(kindOf(kinds, tile), ECONOMY.drillGearCaps)
}

/** One ore cell's share added to the carry: a whole share pays at once and leaves the carry be. */
export function creditOreShare(vehicle: VehicleState, shareBp: number): OreShareCredit {
  if (shareBp >= BASIS_POINTS) return { vehicle, isPaid: true }
  const carried = (vehicle.sideOreCarryBp ?? 0) + shareBp
  const isPaid = carried >= BASIS_POINTS
  return { vehicle: withCarry(vehicle, isPaid ? carried - BASIS_POINTS : carried), isPaid }
}

/** The carry is left out at 0, so a world that never cuts a side ore cell digests as before. */
function withCarry(vehicle: VehicleState, carryBp: number): VehicleState {
  const { sideOreCarryBp: _carried, ...rest } = vehicle
  return carryBp === 0 ? rest : { ...rest, sideOreCarryBp: carryBp }
}

function kindOf(kinds: ReadonlyMap<string, GearCellShare['kind']>, tile: TilePoint): CutCellKind {
  return kinds.get(keyOf(tile)) ?? 'bit'
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
