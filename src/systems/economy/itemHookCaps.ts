/**
 * The kernel's caps and folds for item hooks (GD lock on #206, TD ruling with the Vertical
 * Scaler's pins, ticket 323), `itemHookCaps` in economy.json:
 *
 * - `reachCellsMax` (12, the echo sounder's radius): a reach answer is counted in whole cells and
 *   never takes a lane past it (VS pin 3).
 *
 * Every fold here is order-independent, so the order hooks are registered or read in never
 * changes a result (VS pin 2):
 *
 * - a scalar point sums its integer answers onto the lane's own value, then goes through one clamp;
 * - a selection point sums each candidate tile's integer scores, and the candidates go highest
 *   score first, then in the lane's own order; no candidate is added or dropped;
 * - income claims are summed per `incomeItemId` before the room under the trip cap clamps them, so
 *   two modifiers on one item never claim the cap twice (GD amendment).
 */
import { add, cmp, ZERO_MONEY, type Money } from '../money'
import type { TilePoint } from '../world/tileGrid'
import type { FieldReader } from './economyFieldReader'

export interface ItemHookCaps {
  reachCellsMax: number
}

/** What one modifier adds to the yield of the item it is income for. */
export interface IncomeClaim {
  incomeItemId: string
  value: Money
}

/** `base` plus every answer, in whole units, held to 0 and `cap`. */
export function cappedScalarOf(base: number, answers: readonly number[], cap: number): number {
  const total = answers.reduce((sum, answer) => sum + Math.floor(answer), Math.floor(base))
  return Math.min(cap, Math.max(0, total))
}

/**
 * The candidates, highest summed score first, then in the order given. `scoreLists[i][j]` is one
 * answer's score for `candidates[j]`; a missing score counts 0.
 */
export function rankedBySummedScore(
  candidates: readonly TilePoint[],
  scoreLists: readonly (readonly number[])[],
): TilePoint[] {
  const scores = candidates.map((_tile, index) => summedScoreAt(scoreLists, index))
  return candidates
    .map((tile, index) => ({ tile, index, score: scores[index] }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((ranked) => ranked.tile)
}

/**
 * Each item's claims summed, then held to the room its trip cap leaves, in `incomeItemId` order:
 * the one clamp stays where the yield happens (`roomUnderCapOf`, `magnetCaps.incomeCapBp`).
 */
export function incomeUnderRoomOf(
  claims: readonly IncomeClaim[],
  roomOf: (incomeItemId: string) => Money,
): IncomeClaim[] {
  return [...summedClaimsOf(claims)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([incomeItemId, value]) => ({
      incomeItemId,
      value: smallerOf(value, roomOf(incomeItemId)),
    }))
}

export function readItemHookCaps(reader: FieldReader, value: unknown): ItemHookCaps {
  const caps = reader.object('itemHookCaps', value)
  const reachCellsMax = reader.safeInteger('itemHookCaps.reachCellsMax', caps.reachCellsMax)
  if (reachCellsMax < 0) reader.record('itemHookCaps.reachCellsMax must be 0 or more')
  return { reachCellsMax }
}

function summedScoreAt(scoreLists: readonly (readonly number[])[], index: number): number {
  return scoreLists.reduce((sum, scores) => sum + Math.floor(scores[index] ?? 0), 0)
}

function summedClaimsOf(claims: readonly IncomeClaim[]): Map<string, Money> {
  const sums = new Map<string, Money>()
  for (const { incomeItemId, value } of claims) {
    sums.set(incomeItemId, add(sums.get(incomeItemId) ?? ZERO_MONEY, value))
  }
  return sums
}

/** The smaller amount, never below none. */
function smallerOf(value: Money, room: Money): Money {
  const held = cmp(value, room) > 0 ? room : value
  return cmp(held, ZERO_MONEY) > 0 ? held : ZERO_MONEY
}
