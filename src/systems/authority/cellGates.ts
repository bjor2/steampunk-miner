/**
 * The slices' gate verdict on one cell (docs/standards/feature-slices.md 3.6, K2), shared by the
 * drill (`drillGates.ts`) and the blast (`charges/blastGates.ts`). Only ore cells are asked. A
 * memo keeps one answer per tile for the length of one drill command or one blast slice, so the
 * many samples of a cell ask once and every verdict is read off the state the command or slice
 * started from.
 */
import type { BlastEvent } from '../registries/blastEffects'
import { gateVerdictOf, type GateVerdict } from '../registries/gateChecks'
import { oreTypeOf, type OreType } from '../registries/oreTypes'
import type { YieldedCell } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { materialCellAt } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import { resourceTierOf } from './minedOre'

/** An ore cell a gate has a verdict on. */
export interface GatedCell {
  tile: TilePoint
  ore: OreType
  verdict: GateVerdict
}

/**
 * Who asks about a cell: the player whose drill, charge or power-up it is, and the blast or the
 * power-up's terrain edit `source`, if one.
 */
export interface GateAsker {
  state: AuthorityState
  playerId: string
  params: PlanetParams
  blast: BlastEvent | null
  tool?: string
}

/** One verdict per tile, asked once; tiles in the order they were first asked. */
export type CellGates = Map<string, GatedCell | null>

export function gateOfCell(
  gates: CellGates,
  asker: GateAsker,
  { tile, cell }: YieldedCell,
): GatedCell | null {
  const key = keyOfTile(tile)
  const known = gates.get(key)
  if (known !== undefined) return known
  const gated = askGatesAbout(asker, tile, cell)
  gates.set(key, gated)
  return gated
}

/** The gates' verdict on the ore a tile holds now, asked once with no memo (the bot's look ahead). */
export function gateOfTile(asker: GateAsker, tile: TilePoint): GatedCell | null {
  return askGatesAbout(asker, tile, materialCellAt(asker.state.world, asker.params, tile))
}

/** The `DrillGated` report of a cell the gate stopped the drill at. */
export function drillGatedEventOf(
  { tile, ore, verdict }: GatedCell,
  outcome: 'refused' | 'blocked' | 'lost',
): DomainEventBody {
  return {
    type: 'DrillGated',
    tx: tile.tx,
    ty: tile.ty,
    oreId: ore.id,
    family: ore.family,
    tier: ore.tier,
    gateKind: verdict.gateKind,
    outcome,
    required: verdict.required,
    have: verdict.have,
  }
}

function askGatesAbout(asker: GateAsker, tile: TilePoint, cell: number): GatedCell | null {
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  const { state, playerId, params, blast, tool } = asker
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const verdict = gateVerdictOf({ state, playerId, tile, cell, ore, blast, ...toolOf(tool) })
  return verdict === null ? null : { tile, ore, verdict }
}

/** The query names a tool only when one asks, so a drill or blast query keeps its shape. */
function toolOf(tool: string | undefined): { tool?: string } {
  return tool === undefined ? {} : { tool }
}

function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
