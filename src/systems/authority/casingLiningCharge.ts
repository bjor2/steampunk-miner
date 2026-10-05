/**
 * The first-place lining charge (decision #76, build #85): each ring that lines native rock for the
 * first time is half a metre of new lining (the ring spacing, #41), charged
 * `ceilMilli(k_casing * V(t(p,b)) * 0.5)` at the band `b` of the wall it lined. Relining and
 * grade bumps line no new rock, so they cost nothing; the grade never enters the price.
 *
 * Safety first (#76 Consequences): the lining is laid whatever the wallet holds. A player who
 * cannot pay pays what they have and owes nothing, as the slice has no debt; `casing_lined` logs
 * both the price and what was paid, so the shortfall is derived from the log, never written.
 */
import { CASING_RING_SPACING_MM } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { casingLiningPrice } from '../economy/casingPrices'
import { cmp, div, fromSafeInteger, sub, toCanonical, type BigStat, type Money } from '../money'
import { casingBandOfWall } from '../world/casingBand'
import type { PlanetParams } from '../world/planetParams'
import type { WeightedSample } from '../world/stampShape'
import { withWallet, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'

const RING_LENGTH_M: BigStat = div(
  fromSafeInteger(CASING_RING_SPACING_MM),
  fromSafeInteger(MM_PER_METRE),
)

/** Charge one ring's newly lined `wall`; a ring that lined no new rock is free and logs nothing. */
export function chargeFirstLining(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  wall: readonly WeightedSample[],
  grade: number,
): RuleEffect {
  if (wall.length === 0) return unchanged(state)
  const band = casingBandOfWall(params, wall)
  const price = casingLiningPrice(params.planetIndex, band, RING_LENGTH_M)
  const wallet = state.players[playerId].wallet
  const paid = affordablePart(price, wallet)
  return {
    state: withWallet(state, playerId, sub(wallet, paid)),
    events: [
      {
        type: 'CasingLined',
        lengthMm: CASING_RING_SPACING_MM,
        band,
        grade,
        price: toCanonical(price),
        paid: toCanonical(paid),
      },
    ],
  }
}

/** The price, or all the wallet holds when it holds less. */
function affordablePart(price: Money, wallet: Money): Money {
  return cmp(price, wallet) <= 0 ? price : wallet
}
