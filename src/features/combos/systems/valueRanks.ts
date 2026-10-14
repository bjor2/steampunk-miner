/**
 * "The highest-value eligible cells first" (#162: the assay drain and the lens corer): a
 * selection hook answers one integer score per candidate, so a cell scores how many candidates
 * sell for strictly less than it. Prices stay Money and are only compared, never turned into a
 * number; cells of one price tie, so the lane's own order decides between them. A tile that holds
 * no ore now scores 0.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { cmp, type Money } from '../../../systems/money'
import { saleTierOf } from '../../../systems/registries/oreTypes'
import type { TilePoint } from '../../../systems/world/tileGrid'

interface PricedCandidate {
  index: number
  price: Money | null
}

/** One score per candidate, in their order: the candidates that sell for less. */
export function valueRankScoresOf(
  state: AuthorityState,
  candidates: readonly TilePoint[],
): number[] {
  const priced = candidates.map((tile, index) => ({ index, price: salePriceAt(state, tile) }))
  return scoresOfCheapestFirst([...priced].sort(compareCheaperFirst), candidates.length)
}

function salePriceAt(state: AuthorityState, tile: TilePoint): Money | null {
  const ore = oreTypeAtTile(state, tile)
  return ore === null ? null : oreSalePrice(saleTierOf(ore))
}

/** Each candidate's count of strictly cheaper ones; equal prices share a score. */
function scoresOfCheapestFirst(sorted: readonly PricedCandidate[], count: number): number[] {
  const scores = new Array<number>(count).fill(0)
  sorted.forEach((candidate, position) => {
    const previous = sorted[position - 1]
    const isTie = previous !== undefined && compareCheaperFirst(previous, candidate) === 0
    scores[candidate.index] = isTie ? scores[previous.index] : position
  })
  return scores
}

/** No ore before any price, then by price; equal prices compare equal. */
function compareCheaperFirst(a: PricedCandidate, b: PricedCandidate): number {
  if (a.price === null || b.price === null) return pricedOrderOf(a) - pricedOrderOf(b)
  return cmp(a.price, b.price)
}

/** 0 for a tile with no ore, 1 for a priced one. */
function pricedOrderOf(candidate: PricedCandidate): number {
  return candidate.price === null ? 0 : 1
}
