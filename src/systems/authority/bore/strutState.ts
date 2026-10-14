/**
 * The struts strut-bore shots leave standing (ticket 379, the TD lock on #318; Content's strut bore
 * on #310): an entity, not a cell. Each stands in the mouth a bore broke into a hollow through, the
 * line's last bored cell, keyed by that cell, so one cell holds at most one strut and a reader finds
 * it with one lookup. It opens nothing and yields nothing; collapse reads it only through the #157
 * reinforcement registry (`boreStrut.ts`), and the client lands the rig on its plank
 * (`physics/strutColliders.ts`). Plain JSON of safe integers, saved, restored and digested with the
 * rest; emptied on every planet.
 *
 * A session that never placed one holds no `struts` key at all, so its digests and saves are the
 * ones it had before struts existed.
 */
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export interface BoreStrut {
  /** Whose shot wedged it. */
  playerId: string
  /** The mouth cell it stands in: the line's last bored cell. */
  tx: number
  ty: number
  /** The hollow's cell the line met beyond the mouth, which its plank reaches into. */
  pocketTx: number
  pocketTy: number
  placedTick: number
  /** The tick it falls: the clock takes it away then (`strutClock.ts`). */
  untilTick: number
}

/** The standing struts by their mouth cell's `tx,ty`. */
export type StandingStruts = Readonly<Record<string, BoreStrut>>

export const NO_STRUTS: StandingStruts = {}

export function strutsOf(state: AuthorityState): StandingStruts {
  return state.struts ?? NO_STRUTS
}

export function strutKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

/** The strut standing in the cell, or null. */
export function strutAt(state: AuthorityState, tx: number, ty: number): BoreStrut | null {
  return strutsOf(state)[strutKeyOf({ tx, ty })] ?? null
}

/** The state with these struts; with none, the `struts` key is dropped. */
export function withStruts(state: AuthorityState, struts: StandingStruts): AuthorityState {
  const { struts: _dropped, ...rest } = state
  return Object.keys(struts).length === 0 ? rest : { ...rest, struts }
}

/** The state with `strut` standing in its cell, in place of any strut there before. */
export function withStrutStanding(state: AuthorityState, strut: BoreStrut): AuthorityState {
  return withStruts(state, { ...strutsOf(state), [strutKeyOf(strut)]: strut })
}

export function portableStrutsOf(struts: StandingStruts): Record<string, BoreStrut> {
  return Object.fromEntries(Object.entries(struts).map(([key, strut]) => [key, { ...strut }]))
}

export function portableStrutsProblems(struts: unknown, path: string): string[] {
  if (struts === undefined) return []
  if (!isJsonObject(struts) || Object.keys(struts).length === 0) {
    return [`${path} must be a non-empty object`]
  }
  return Object.entries(struts)
    .filter(([key, strut]) => !isStrutUnderKey(key, strut))
    .map(([key]) => `${path}["${key}"] is malformed`)
}

function isStrutUnderKey(key: string, strut: unknown): boolean {
  return isBoreStrut(strut) && key === strutKeyOf(strut as BoreStrut)
}

function isBoreStrut(strut: unknown): boolean {
  return (
    isJsonObject(strut) &&
    typeof strut.playerId === 'string' &&
    [strut.tx, strut.ty, strut.pocketTx, strut.pocketTy].every(Number.isSafeInteger) &&
    [strut.placedTick, strut.untilTick].every(isWholeNumber)
  )
}
