/**
 * The strut bore's strut (ticket 379, K-strut of the TD lock on #318; Content's strut bore on #310,
 * the GD's "an entity, not a terrain cell"). A line whose shot carries `strutTicks` stops where it
 * meets a hollow's edge: the first open cell after ground it bored itself, right beside its last
 * bored cell. The unspent budget is forfeited, as at any stop, and a strut is wedged in that last
 * bored cell, the mouth, standing `strutTicks`. It opens no cell, inside the hollow or anywhere,
 * and yields nothing: the line's own cells are the only ones the shot opened.
 *
 * Collapse sees a strut only through the #157 reinforcement registry (the HS condition on #318: no
 * side path): `strutReinforces` answers for the mouth cell, one lookup, and a slice registers it
 * with `r.reinforcement`. A shape asking for struts while no provider answers through it throws,
 * like any shape outside its caps (`shotShape.ts`), so a strut never stands unread by collapse.
 *
 * Open cells a sibling line of the same shot opened are the shot's own ground, never a hollow.
 */
import type { TilePoint } from '../../world/tileGrid'
import { entriesOf } from '../../registries/seal'
import { REINFORCEMENT_REGISTRY } from '../../registries/groundReinforcement'
import type { AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import type { CellOpening } from './boreCell'
import { boresOf, isSameShot, type PendingBore } from './boreState'
import { strutAt, withStrutStanding, type BoreStrut } from './strutState'

/** The registry's answer for a strut: the cell is a standing strut's mouth. */
export function strutReinforces(state: AuthorityState, tx: number, ty: number): boolean {
  return strutAt(state, tx, ty) !== null
}

/** Whether a registered reinforcement provider answers through `strutReinforces`. */
export function isStrutReinforcementRegistered(): boolean {
  return entriesOf(REINFORCEMENT_REGISTRY).some(
    (provider) => provider.reinforces === strutReinforces,
  )
}

/** The cell's opening, or the strut stop when the line meets a hollow's edge there. */
export function strutStopOr(
  state: AuthorityState,
  bore: PendingBore,
  tile: TilePoint,
  opening: CellOpening,
): CellOpening {
  if (!isHollowEdge(state, bore, tile, opening)) return opening
  return { kind: 'stopped', stop: 'strut', events: [] }
}

/** The strut wedged in the mouth when this cell stopped the line at a hollow's edge. */
export function strutOnStop(
  state: AuthorityState,
  bore: PendingBore,
  pocket: TilePoint,
  opening: CellOpening,
  tick: number,
): RuleEffect {
  const isStrutStop = opening.kind === 'stopped' && opening.stop === 'strut'
  if (!isStrutStop) return unchanged(state)
  const strut = strutOf(bore, pocket, tick)
  return { state: withStrutStanding(state, strut), events: [strutPlacedOf(strut)] }
}

/**
 * A strut shot's line passing an open cell beside the ground it bored, which no sibling line of
 * its shot opened.
 */
function isHollowEdge(
  state: AuthorityState,
  bore: PendingBore,
  tile: TilePoint,
  opening: CellOpening,
): boolean {
  if (bore.shot.strutTicks === undefined || opening.kind !== 'passed') return false
  const mouth = lastBoredOf(bore)
  return mouth !== null && isBeside(mouth, tile) && !isBoredBySibling(state, bore, tile)
}

function lastBoredOf(bore: PendingBore): TilePoint | null {
  return bore.bored.at(-1) ?? null
}

/** The cells touch, by a side or a corner. */
function isBeside(a: TilePoint, b: TilePoint): boolean {
  return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty)) === 1
}

function isBoredBySibling(state: AuthorityState, bore: PendingBore, tile: TilePoint): boolean {
  return boresOf(state).some(
    (other) =>
      other !== bore &&
      isSameShot(other, bore) &&
      other.bored.some((cell) => isSameTile(cell, tile)),
  )
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function strutOf(bore: PendingBore, pocket: TilePoint, tick: number): BoreStrut {
  const mouth = lastBoredOf(bore) as TilePoint
  return {
    playerId: bore.playerId,
    tx: mouth.tx,
    ty: mouth.ty,
    pocketTx: pocket.tx,
    pocketTy: pocket.ty,
    placedTick: tick,
    untilTick: tick + (bore.shot.strutTicks as number),
  }
}

function strutPlacedOf(strut: BoreStrut): DomainEventBody {
  return { type: 'StrutPlaced', tx: strut.tx, ty: strut.ty, untilTick: strut.untilTick }
}
