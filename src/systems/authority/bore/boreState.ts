/**
 * The bore gun's shots in authority state (ticket 313, TD architecture point 1 on #309): each
 * shot stays as a pending bore while its cells open one by one, while its bored line stands
 * before the collapse check, and until its `nextShotTick`, the one clock its player's next shot
 * waits on (the TD's recovery ruling on #313). Plain JSON of safe integers,
 * so it is saved, restored and digested with the rest; emptied on every planet.
 *
 * A session that never fired holds no `bores` key at all, so its digests and saves are the ones
 * it had before the gun existed.
 */
import type { IntegerVector } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

/** The numbers a shot was fired with, kept so a later level change never alters it mid-bore. */
export interface BoreShot {
  gunFactorBp: number
  energyPerCellBp: number
  openIntervalTicks: number
  collapseHoldTicks: number
  boreBudgetTicks: number
  /** The rate level's numbers when the shot fired: a level bought later waits for the next shot. */
  cooldownTicks: number
  kGunPct: number
}

export interface PendingBore {
  playerId: string
  firedTick: number
  /** The rig's centre when it fired, in mm: the collapse checks go nearest first from it. */
  origin: IntegerVector
  shot: BoreShot
  /** The cells still to open, in walk order; empty once the bore has ended. */
  cells: readonly TilePoint[]
  /** The tick the next cell opens. */
  nextOpenTick: number
  /** Ticks of the dig function the shot may still spend. */
  budgetLeft: number
  /** The cells the bore opened, in order: the line its collapse check reads. */
  bored: readonly TilePoint[]
  /** The bore's end plus its hold, when its blocks are checked; null while cells still open. */
  checkTick: number | null
  /** How many of its disturbed blocks, nearest first, have been checked. */
  blocksChecked: number
  /**
   * The first tick its player may fire again: the fire tick plus `gunRecoveryTicks` of the dig
   * ticks its cells have taken so far, so it is final once the line ends.
   */
  nextShotTick: number
  /**
   * The bearing, when auto mode fired the shot (ticket 317); absent for a manual shot, so a
   * session that never used auto saves and digests as before.
   */
  autoAim?: number
}

export const NO_BORES: readonly PendingBore[] = []

export function boresOf(state: AuthorityState): readonly PendingBore[] {
  return state.bores ?? NO_BORES
}

/** The state with these bores; with none, the `bores` key is dropped. */
export function withBores(state: AuthorityState, bores: readonly PendingBore[]): AuthorityState {
  const { bores: _dropped, ...rest } = state
  return bores.length === 0 ? rest : { ...rest, bores }
}

export function isBoreOpening(bore: PendingBore): boolean {
  return bore.cells.length > 0
}

export function portableBoresOf(bores: readonly PendingBore[]): PendingBore[] {
  return bores.map((bore) => ({
    ...bore,
    origin: { ...bore.origin },
    shot: { ...bore.shot },
    cells: bore.cells.map(copyTile),
    bored: bore.bored.map(copyTile),
  }))
}

export function portableBoresProblems(bores: unknown, path: string): string[] {
  if (bores === undefined) return []
  if (!Array.isArray(bores) || bores.length === 0) return [`${path} must be a non-empty list`]
  return bores
    .map((bore, index) => ({ bore, index }))
    .filter(({ bore }) => !isPendingBore(bore))
    .map(({ index }) => `${path}[${index}] is malformed`)
}

function copyTile(tile: TilePoint): TilePoint {
  return { tx: tile.tx, ty: tile.ty }
}

function isPendingBore(bore: unknown): boolean {
  return (
    isJsonObject(bore) &&
    typeof bore.playerId === 'string' &&
    isIntegerVector(bore.origin) &&
    isBoreShot(bore.shot) &&
    isTileList(bore.cells) &&
    isTileList(bore.bored) &&
    [
      bore.firedTick,
      bore.nextOpenTick,
      bore.budgetLeft,
      bore.blocksChecked,
      bore.nextShotTick,
    ].every(isWholeNumber) &&
    (bore.checkTick === null || isWholeNumber(bore.checkTick)) &&
    (bore.autoAim === undefined || isWholeNumber(bore.autoAim))
  )
}

const SHOT_FIELDS: readonly (keyof BoreShot)[] = [
  'gunFactorBp',
  'energyPerCellBp',
  'openIntervalTicks',
  'collapseHoldTicks',
  'boreBudgetTicks',
  'cooldownTicks',
  'kGunPct',
]

function isBoreShot(shot: unknown): boolean {
  return (
    isJsonObject(shot) &&
    SHOT_FIELDS.every((field) => isWholeNumber(shot[field])) &&
    shot.kGunPct !== 0
  )
}

function isIntegerVector(point: unknown): boolean {
  return isJsonObject(point) && Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
}

function isTileList(tiles: unknown): boolean {
  return Array.isArray(tiles) && tiles.every(isTile)
}

function isTile(tile: unknown): boolean {
  return isJsonObject(tile) && Number.isSafeInteger(tile.tx) && Number.isSafeInteger(tile.ty)
}
