/**
 * The gated ore cells a docked vehicle sees (ticket 299 debug read): the generated cells within
 * `DOCK_VIEW_COLUMNS` of the dock point and `DOCK_VIEW_ROWS` under the pad, inside the 20 m
 * zoom-out view (#38), so an e2e spec finds a planet and seed whose ground shows each gate kind
 * without driving anywhere. A pure read of the planet's generated world.
 */
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import { dockSiteOf } from '../../../systems/world/dockSite'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { cellGateOf } from './cellGates'
import type { CellGate } from './gateTable'

export const DOCK_VIEW_COLUMNS = 14
export const DOCK_VIEW_ROWS = 14

export interface GatedTile extends TilePoint {
  gate: CellGate
  /** 1 for the row just under the pad. */
  rowsUnderPad: number
}

/** Every gated ore cell in the docked view, row by row from the pad down. */
export function gatedTilesNearDock(params: PlanetParams): GatedTile[] {
  const { dockPoint, padRow } = dockSiteOf(params)
  const found: GatedTile[] = []
  for (let row = padRow - 1; row >= padRow - DOCK_VIEW_ROWS; row--) {
    for (let tx = dockPoint.tx - DOCK_VIEW_COLUMNS; tx <= dockPoint.tx + DOCK_VIEW_COLUMNS; tx++) {
      const gate = gateAt(params, { tx, ty: row })
      if (gate !== null) found.push({ tx, ty: row, gate, rowsUnderPad: padRow - row })
    }
  }
  return found
}

/** The gate of the generated ore cell at `tile`, or null for any other cell or no gate. */
function gateAt(params: PlanetParams, tile: TilePoint): CellGate | null {
  const cell = cellAt(EMPTY_WORLD, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  const gate = cellGateOf(params, tile, ore)
  return gate.kind === 'none' ? null : gate
}
