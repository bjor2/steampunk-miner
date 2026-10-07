/**
 * A terrain tool's plan becomes its use's outcome (#162 sections 2.3 and 3): the whole edit joins
 * the world's shared K6 queue on the activation tick as one edit, which the clock applies a share
 * a tick, and its `terrain_edit` line names the cells it changes, the chunks it touches and a hash
 * of the cells in order. A plan that a gate or core cell stopped before it changed anything is
 * `blocked` (the use costs nothing and logs `power_up_blocked_by_gate`); one that found nothing to
 * act on is `refused` and costs nothing either.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { RuleEffect } from '../../../systems/authority/commandRule'
import {
  queueTerrainEdit,
  type TerrainCellEdit,
} from '../../../systems/authority/terrain/terrainEdits'
import { hashCell } from '../../../systems/cellRandom'
import { chunkKey, chunkOfTile, type TilePoint } from '../../../systems/world/tileGrid'
import type { GateBlock, PowerUpOutcome } from '../../power-up-core'
import { terrainEditedOf } from './terrainEvents'

/** What a tool decided to do with one use. */
export type TerrainPlan =
  | { kind: 'edit'; cells: readonly TerrainCellEdit[] }
  | { kind: 'blocked'; block: GateBlock }
  | { kind: 'refused'; reason: string }

/** Who queued an edit, with what, from where. */
export interface EditAuthor {
  playerId: string
  itemId: string
  mark: number
  origin: TilePoint
}

export function outcomeOfPlan(
  state: AuthorityState,
  author: EditAuthor,
  plan: TerrainPlan,
): PowerUpOutcome {
  if (plan.kind === 'blocked') return plan
  if (plan.kind === 'refused') return plan
  return { kind: 'acted', effect: queueEditOf(state, author, plan.cells) }
}

/** The edit joins the queue, and its line says what it will change. */
export function queueEditOf(
  state: AuthorityState,
  author: EditAuthor,
  cells: readonly TerrainCellEdit[],
): RuleEffect {
  const { playerId, itemId, mark, origin } = author
  return {
    state: queueTerrainEdit(state, { playerId, source: editSourceOf(itemId), cells }),
    events: [
      terrainEditedOf({
        playerId,
        itemId,
        mark,
        originTx: origin.tx,
        originTy: origin.ty,
        cellsChanged: cells.length,
        chunksTouched: chunksTouchedBy(cells),
        editHash: editHashOf(cells),
      }),
    ],
  }
}

/** The edit's `source` on the queue and in the gate query: `terrain-tools.ore_shifter`. */
export function editSourceOf(itemId: string): string {
  return `terrain-tools.${itemId.slice(itemId.indexOf('.') + 1)}`
}

export function chunksTouchedBy(cells: readonly TerrainCellEdit[]): number {
  return new Set(cells.map(({ tx, ty }) => chunkKey(chunkOfTile(tx), chunkOfTile(ty)))).size
}

/** The cells in order, hashed with the cell hash: eight hex digits. */
export function editHashOf(cells: readonly TerrainCellEdit[]): string {
  const hash = cells.reduce(
    (running, cell) =>
      hashCell(hashCell(running, cell.tx, cell.ty), kindCodeOf(cell), valueOf(cell)),
    cells.length,
  )
  return hash.toString(16).padStart(8, '0')
}

function kindCodeOf(cell: TerrainCellEdit): number {
  return cell.kind === 'density' ? 0 : 1
}

function valueOf(cell: TerrainCellEdit): number {
  return cell.kind === 'density' ? cell.density : cell.cell
}
