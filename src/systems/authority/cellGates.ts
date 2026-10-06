/**
 * The slices' gate verdict on one cell (docs/standards/feature-slices.md 3.6, K2), shared by the
 * drill (`drillGates.ts`) and the blast (`charges/blastGates.ts`). Only ore cells are asked. A
 * memo keeps one answer per tile for the length of one drill command or one blast, so the many
 * samples of a cell ask once and every verdict is read off the state the command started from.
 */
import type { BlastEvent } from '../registries/blastEffects'
import { gateVerdictOf, type GateVerdict } from '../registries/gateChecks'
import { oreTypeOf, type OreType } from '../registries/oreTypes'
import type { YieldedCell } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import type { AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import { resourceTierOf } from './minedOre'

/** An ore cell a gate has a verdict on. */
export interface GatedCell {
  tile: TilePoint
  ore: OreType
  verdict: GateVerdict
}

/** Who asks about a cell: the player whose drill or charge it is, and the blast, if one. */
export interface GateAsker {
  state: AuthorityState
  playerId: string
  params: PlanetParams
  blast: BlastEvent | null
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

/** The `DrillGated` report of a cell the gate stopped the drill at. */
export function drillGatedEventOf(
  { tile, ore, verdict }: GatedCell,
  outcome: 'refused' | 'lost',
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
  const { state, playerId, params, blast } = asker
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const verdict = gateVerdictOf({ state, playerId, tile, cell, ore, blast })
  return verdict === null ? null : { tile, ore, verdict }
}

function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
