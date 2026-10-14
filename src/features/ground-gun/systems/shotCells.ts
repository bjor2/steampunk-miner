/**
 * The cells the shoring shot holds as permanent ground (the `ground-gun.shot-cells` save section
 * v1, ticket 369; piece iii of the #157 seam, the GD ruling and TD lock there): every cell a
 * cementing round opened, keyed by its `tx,ty` so the reinforcement provider answers with one
 * lookup, never a walk. Per-cell world state, so the section is the session's, not a player's:
 * a shot cell holds for every player, and ownership is checked once, when the shot applies
 * (`shoringShot.ts`), never here.
 *
 * At its initial value (no shot cell) the section is out of the state and the digest, so a session
 * that never fired a cementing round saves and digests as before, and a save written before this
 * section restores with none (#224's restored-section path). Every field is a safe integer, so the
 * portable form is the value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import type { ReinforcementProvider } from '../../../systems/registries/groundReinforcement'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** The shot cells by their `tx,ty`. */
export type ShotCells = Readonly<Record<string, TilePoint>>

export const NO_SHOT_CELLS: ShotCells = {}

export const SHOT_CELLS_SECTION: SaveSection<ShotCells> = {
  id: 'ground-gun.shot-cells',
  version: 1,
  scope: 'session',
  initial: NO_SHOT_CELLS,
  problems: shotCellsProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as ShotCells,
}

/** The shoring shot's `groundReinforcement` provider: a shot cell is reinforced, O(1) a cell. */
export const SHOT_CELL_REINFORCEMENT: ReinforcementProvider = {
  id: 'ground-gun.shot-cells',
  reinforces: isShotCell,
}

export function shotCellsOf(state: AuthorityState): ShotCells {
  return readSection(state, null, SHOT_CELLS_SECTION)
}

export function isShotCell(state: AuthorityState, tx: number, ty: number): boolean {
  return Object.hasOwn(shotCellsOf(state), shotCellKeyOf({ tx, ty }))
}

/** The cells of `tiles` that are no shot cell yet, each once, in order. */
export function newShotCellsOf(state: AuthorityState, tiles: readonly TilePoint[]): TilePoint[] {
  const cells = shotCellsOf(state)
  const byKey = new Map(tiles.map((tile) => [shotCellKeyOf(tile), tile]))
  return [...byKey].filter(([key]) => !Object.hasOwn(cells, key)).map(([, tile]) => tile)
}

/** The state with `tiles` held as shot cells too. */
export function withShotCellsAdded(
  state: AuthorityState,
  tiles: readonly TilePoint[],
): AuthorityState {
  const added = Object.fromEntries(tiles.map((tile) => [shotCellKeyOf(tile), copyTile(tile)]))
  return withShotCells(state, { ...shotCellsOf(state), ...added })
}

/** The state without these cells: cutting a reinforced cell removes it (TD lock on #157, 2). */
export function withShotCellsCut(
  state: AuthorityState,
  tiles: readonly TilePoint[],
): AuthorityState {
  const cut = new Set(tiles.map(shotCellKeyOf))
  const kept = Object.entries(shotCellsOf(state)).filter(([key]) => !cut.has(key))
  return withShotCells(state, Object.fromEntries(kept))
}

/** The state with no shot cell: another planet is another world. */
export function withNoShotCells(state: AuthorityState): AuthorityState {
  return withShotCells(state, NO_SHOT_CELLS)
}

export function shotCellKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function withShotCells(state: AuthorityState, cells: ShotCells): AuthorityState {
  return withSection(state, null, SHOT_CELLS_SECTION, cells)
}

function copyTile({ tx, ty }: TilePoint): TilePoint {
  return { tx, ty }
}

function shotCellsProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['ground-gun.shot-cells must be an object']
  return Object.entries(body).flatMap(([key, cell]) => shotCellProblems(key, cell))
}

function shotCellProblems(key: string, cell: unknown): string[] {
  const path = `ground-gun.shot-cells.${key}`
  if (!isJsonObject(cell)) return [`${path} must be an object`]
  if (!Number.isSafeInteger(cell.tx) || !Number.isSafeInteger(cell.ty)) {
    return [`${path} must hold a safe integer tx and ty`]
  }
  const keyOfCell = shotCellKeyOf(cell as unknown as TilePoint)
  return keyOfCell === key ? [] : [`${path} holds the cell ${keyOfCell}`]
}
