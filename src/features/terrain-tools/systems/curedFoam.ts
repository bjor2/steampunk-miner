/**
 * The cells stabiliser foam has cured for good (the `terrain-tools.cured-foam` save section v1,
 * ticket 368; piece iv of the #157 seam, the GD ruling and TD lock there): every cell a spray at
 * foam's cure Mark set, keyed by its `tx,ty` so the reinforcement provider answers with one lookup,
 * never a walk. Reinforcement is per-cell world state, so the section is the session's, not a
 * player's: a cured cell holds for every player, and ownership is checked once, on the spray
 * (`stabiliserFoam.ts`), never here.
 *
 * At its initial value (no cured cell) the section is out of the state and the digest, so a session
 * that never cured foam saves and digests as before, and a save written before this section
 * restores with none (#224's restored-section path). Every field is a safe integer, so the portable
 * form is the value. The shape is the shoring shot's `ground-gun.shot-cells` (ticket 369).
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

/** The cured cells by their `tx,ty`. */
export type CuredFoam = Readonly<Record<string, TilePoint>>

export const NO_CURED_FOAM: CuredFoam = {}

export const CURED_FOAM_SECTION: SaveSection<CuredFoam> = {
  id: 'terrain-tools.cured-foam',
  version: 1,
  scope: 'session',
  initial: NO_CURED_FOAM,
  problems: curedFoamProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as CuredFoam,
}

/** Cured foam's `groundReinforcement` provider: a cured cell is reinforced, O(1) a cell. */
export const CURED_FOAM_REINFORCEMENT: ReinforcementProvider = {
  id: 'terrain-tools.cured-foam',
  reinforces: isCuredFoamCell,
}

export function curedFoamOf(state: AuthorityState): CuredFoam {
  return readSection(state, null, CURED_FOAM_SECTION)
}

export function isCuredFoamCell(state: AuthorityState, tx: number, ty: number): boolean {
  return Object.hasOwn(curedFoamOf(state), curedCellKeyOf({ tx, ty }))
}

/** The cells of `tiles` not cured yet, each once, in order. */
export function newCuredCellsOf(state: AuthorityState, tiles: readonly TilePoint[]): TilePoint[] {
  const cured = curedFoamOf(state)
  const byKey = new Map(tiles.map((tile) => [curedCellKeyOf(tile), tile]))
  return [...byKey].filter(([key]) => !Object.hasOwn(cured, key)).map(([, tile]) => tile)
}

/** The state with `tiles` cured too. */
export function withCuredCellsAdded(
  state: AuthorityState,
  tiles: readonly TilePoint[],
): AuthorityState {
  const added = Object.fromEntries(tiles.map((tile) => [curedCellKeyOf(tile), copyTile(tile)]))
  return withCuredFoam(state, { ...curedFoamOf(state), ...added })
}

/** The state without these cells: cutting a reinforced cell removes it (TD lock on #157, 2). */
export function withCuredCellsCut(
  state: AuthorityState,
  tiles: readonly TilePoint[],
): AuthorityState {
  const cut = new Set(tiles.map(curedCellKeyOf))
  const kept = Object.entries(curedFoamOf(state)).filter(([key]) => !cut.has(key))
  return withCuredFoam(state, Object.fromEntries(kept))
}

/** The state with no cured cell: another planet is another world. */
export function withNoCuredFoam(state: AuthorityState): AuthorityState {
  return withCuredFoam(state, NO_CURED_FOAM)
}

function curedCellKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function withCuredFoam(state: AuthorityState, cells: CuredFoam): AuthorityState {
  return withSection(state, null, CURED_FOAM_SECTION, cells)
}

function copyTile({ tx, ty }: TilePoint): TilePoint {
  return { tx, ty }
}

function curedFoamProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['terrain-tools.cured-foam must be an object']
  return Object.entries(body).flatMap(([key, cell]) => curedCellProblems(key, cell))
}

function curedCellProblems(key: string, cell: unknown): string[] {
  const path = `terrain-tools.cured-foam.${key}`
  if (!isJsonObject(cell)) return [`${path} must be an object`]
  if (!Number.isSafeInteger(cell.tx) || !Number.isSafeInteger(cell.ty)) {
    return [`${path} must hold a safe integer tx and ty`]
  }
  const keyOfCell = curedCellKeyOf(cell as unknown as TilePoint)
  return keyOfCell === key ? [] : [`${path} holds the cell ${keyOfCell}`]
}
