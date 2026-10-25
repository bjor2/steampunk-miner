/**
 * What the Damp Flask's cell on the tool slot bar shows (ticket 881): the flask's icon, the
 * flasks carried as its charges against the carry limit, and while one is open the window still
 * to run as its ring, lit as acting. Nothing while no flask is carried, so the cell is gone.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { ToolFace } from '../../../systems/input/toolSlots'
import { countHeldToSafe } from '../../../systems/wholeCount'
import { kitItemIconIdOf } from './kitItemContent'
import { kitHoldingsOf } from './kitHoldingsSection'
import { heldCountOf, isFlaskOpenAt } from './kitHoldings'
import { PLANET_KIT_ECONOMY, PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

const FLASK_ACTING = PLANET_KIT_ECONOMY.acting.flask
const FLASK = kitItemOf(PLANET_KITS, FLASK_ACTING.itemId) as KitItem
const WHOLE_PERCENT = 100

export function flaskToolFaceOf(state: AuthorityState, playerId: string): ToolFace | null {
  const holdings = kitHoldingsOf(state, playerId)
  const carried = heldCountOf(holdings, FLASK.id)
  if (carried === 0n) return null
  const isOpen = isFlaskOpenAt(holdings, state.tick)
  return {
    iconId: kitItemIconIdOf(FLASK.id),
    name: FLASK.name,
    cooldownPercent: isOpen ? openPercentLeft(holdings.flaskUntilTick as number, state.tick) : 0,
    chargesLeft: countHeldToSafe(carried),
    chargesMax: FLASK.stackLimit ?? 1,
    isOn: isOpen,
    isActing: isOpen,
  }
}

/** The share of the open window still to run, in whole percent, rounded up so it shows to the end. */
function openPercentLeft(untilTick: number, tick: number): number {
  return Math.ceil(((untilTick - tick) * WHOLE_PERCENT) / FLASK_ACTING.openTicks)
}
