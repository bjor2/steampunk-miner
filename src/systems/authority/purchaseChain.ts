/**
 * Hold-to-buy chains at the authority (#180 section 2 "Authority", the TD and GD locks on #177,
 * ticket 226). Every purchase on the Upgrade bay's stepped rows (`buyUpgrade`, `buyGun`,
 * `buyChargeRackSlot`, `buyCasingGrade`) carries `chain`: 0 for a click, otherwise the id of the
 * hold the step belongs to. A chain is a series of single-step commands, never a batch, so it costs
 * exactly the sum of its steps and a refused step buys nothing while the steps before it stand.
 *
 * A held step that can pay but would leave the wallet under the service reserve, read at its tick,
 * is refused `service_reserve` after `money_short` (#180 amendment 2: money wins); a click may
 * spend into the reserve. The authority keeps no chain state: `chain` is an envelope the rules and
 * the log read, and the digest never covers it.
 */
import { cmp, sub, toCanonical, type Money } from '../money'
import type { AuthorityState } from './authorityState'
import { rejectionOf, type Rejection } from './commandRule'
import type { PurchaseChainStamp } from './domainEvent'
import { isJsonObject, isWholeNumber } from './payloadFields'
import { serviceReserveOf } from './serviceReserve'

/** The `chain` of a click: a single buy that may spend into the service reserve. */
export const CLICK_CHAIN = 0

/** Whether a purchase step belongs to a hold rather than a click. */
export function isHeldStep(chain: number): boolean {
  return chain !== CLICK_CHAIN
}

/** A held step that would leave the wallet under the service reserve; null for a click. */
export function serviceReserveRejection(
  state: AuthorityState,
  playerId: string,
  chain: number,
  price: Money,
): Rejection | null {
  if (!isHeldStep(chain)) return null
  const left = sub(state.players[playerId].wallet, price)
  const reserve = serviceReserveOf(state, playerId)
  if (cmp(left, reserve) >= 0) return null
  const kept = `leaves ${toCanonical(left)}, keeps ${toCanonical(reserve)} for service`
  return rejectionOf('service_reserve', kept)
}

/**
 * What a bought step's event says of its chain, read from the state the step left: the hold's id,
 * and for a held step what the wallet still holds above the service reserve (negative when the
 * step itself raised the reserve, as a boiler pip or a rack slot does).
 */
export function chainStampOf(
  paid: AuthorityState,
  playerId: string,
  chain: number,
): PurchaseChainStamp {
  if (!isHeldStep(chain)) return { chain }
  const above = sub(paid.players[playerId].wallet, serviceReserveOf(paid, playerId))
  return { chain, reserveLeft: toCanonical(above) }
}

/** The hold a refused command's payload names, for its `CommandRejected`; nothing for a click. */
export function refusedChainOf(payload: unknown): { chain?: number } {
  if (!isJsonObject(payload) || !isWholeNumber(payload.chain)) return {}
  const chain = payload.chain as number
  return isHeldStep(chain) ? { chain } : {}
}
