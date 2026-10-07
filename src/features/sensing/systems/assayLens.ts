/**
 * What the assay lens reads (#162 Sensing row, the radius from #162 4.4): every ore cell within its
 * radius of the miner that the miner can see, with its family, grade, rarity lead, the price the
 * Sell bay pays this player for a unit and the gate it needs (drill tier, extractor or dynamite).
 * It sees along open cells only, never through rock: that is the *Ore Whisper* artefact's trick,
 * not the lens's. Reveal only (Vertical Scaler on #157): nothing here changes the world or the hold.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { sellBayUnitPrice } from '../../../systems/authority/platformServices'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import type { Money } from '../../../systems/money'
import { saleTierOf, type OreType } from '../../../systems/registries/oreTypes'
import {
  tileOfMillimetres,
  tileOfPose,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isAirCell, tierOffsetOfCell } from '../../../systems/world/worldCell'
import { cellAt, type WorldState } from '../../../systems/world/worldState'
import { cellGateOf, itemOfGate, type CellGateKind } from '../../mining-gates'
import { tilesWithin } from './tileDisc'

export interface AssayReading {
  tile: TilePoint
  oreId: string
  family: string
  grade: number
  /** Tiers above its band's ore (#140's lead roll, up to 2); below 0 for a patch spilled upward. */
  lead: number
  /** What the Sell bay pays this player for one unit on this planet, before any bill. */
  unitPrice: Money
  gate: CellGateKind
  /** The extractor id, `dynamite` or `drill-signature` the gate asks for; null for none or dense. */
  gateItem: string | null
}

interface Ground {
  world: WorldState
  params: PlanetParams
}

const HALF_TILE_MM = MM_PER_METRE / 2
/** Four samples a tile, so the sight line skips no cell between the miner and the ore. */
const SIGHT_STEP_MM = MM_PER_METRE / 4

/** Every ore cell the lens reads, row by row; empty with no pose or no world. */
export function assayReadingsOf(
  state: AuthorityState,
  playerId: string,
  radiusTiles: number,
): AssayReading[] {
  const pose = state.players[playerId].vehicle.pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return []
  const ground = { world: state.world, params }
  return tilesWithin(tileOfPose(pose), radiusTiles)
    .filter((tile) => isInSight(ground, pose, tile))
    .flatMap((tile) => readingAt(state, playerId, ground, tile))
}

function readingAt(
  state: AuthorityState,
  playerId: string,
  ground: Ground,
  tile: TilePoint,
): AssayReading[] {
  const ore = oreTypeAtTile(state, tile)
  if (ore === null) return []
  const gate = cellGateOf(ground.params, tile, ore)
  return [
    {
      tile,
      oreId: ore.id,
      family: ore.family,
      grade: ore.grade,
      lead: leadOf(ground, tile),
      unitPrice: unitPriceOf(state, playerId, ore),
      gate: gate.kind,
      gateItem: itemOfGate(gate),
    },
  ]
}

/** The cell's tier offset over its band's: band `b` ore has offset `b - 1` (worldCell.ts). */
function leadOf(ground: Ground, tile: TilePoint): number {
  const offset = tierOffsetOfCell(cellAt(ground.world, ground.params, tile))
  return offset - (bandOfTile(ground.params, tile.tx, tile.ty) - 1)
}

function unitPriceOf(state: AuthorityState, playerId: string, ore: OreType): Money {
  return sellBayUnitPrice(state, playerId, saleTierOf(ore))
}

/**
 * Whether every cell the line from the miner's centre to the tile's centre crosses before it is
 * open. The miner's own tile counts as open: the hull stands in it.
 */
function isInSight(ground: Ground, pose: VehiclePose, target: TilePoint): boolean {
  const own = tileOfPose(pose)
  const dx = target.tx * MM_PER_METRE + HALF_TILE_MM - pose.x
  const dy = target.ty * MM_PER_METRE + HALF_TILE_MM - pose.y
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / SIGHT_STEP_MM))
  for (let step = 1; step < steps; step += 1) {
    const tile = tileOfMillimetres(
      pose.x + Math.floor((dx * step) / steps),
      pose.y + Math.floor((dy * step) / steps),
    )
    if (isSameTile(tile, target)) return true
    if (!isSameTile(tile, own) && !isAirCell(cellAt(ground.world, ground.params, tile)))
      return false
  }
  return true
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}
