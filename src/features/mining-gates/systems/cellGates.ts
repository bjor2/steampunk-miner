/**
 * The gate on one ore cell (#142 "Slice and contract"): the cell's family, tier and signature flag
 * name its entry in the gate table of the band it lies in. A cell no entry of its band describes
 * (a patch that spilled over a band edge into the next band's tier) carries no gate. The table of
 * a planet is computed once and kept, a pure function of the planet's params.
 */
import type { OreType } from '../../../systems/registries/oreTypes'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { oreMixOf } from '../../planet-mix'
import { gateTableOf, type CellGate, type GatedEntry, type GateTable } from './gateTable'

const NO_GATE: CellGate = { kind: 'none' }
/** A few planets at once: the session's, and the bot's or a report's next. */
const KEPT_TABLES = 8
const keptTables = new Map<string, GateTable>()

export function cellGateOf(params: PlanetParams, tile: TilePoint, ore: OreType): CellGate {
  const band = bandOfTile(params, tile.tx, tile.ty)
  const entries = gateTableOfPlanet(params).bands[band - 1] ?? []
  return entries.find((gated) => isEntryOfOre(gated, ore))?.gate ?? NO_GATE
}

/** The planet's gate table, kept for the next ask. */
export function gateTableOfPlanet(params: PlanetParams): GateTable {
  const key = `${params.planetIndex}:${params.planetSeed}`
  const kept = keptTables.get(key)
  if (kept !== undefined) return kept
  const table = gateTableOf(oreMixOf(params))
  keepTable(key, table)
  return table
}

function keepTable(key: string, table: GateTable): void {
  if (keptTables.size >= KEPT_TABLES) keptTables.delete(keptTables.keys().next().value as string)
  keptTables.set(key, table)
}

function isEntryOfOre({ entry }: GatedEntry, ore: OreType): boolean {
  return (
    entry.tier === ore.tier &&
    entry.family === ore.family &&
    entry.signature === (ore.signature === true)
  )
}
