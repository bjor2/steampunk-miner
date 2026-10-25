/**
 * The Damp Flask, uncorked on purpose (ticket 881; the HS's point 3 on #850: a consumable the
 * player fires, never a context verb; the TD's seam as amended): the host command
 * `planet-kit.uncork_flask` spends one carried flask, the stack of the lowest g first, and opens
 * it until `openTicks` from now, kept as `flaskUntilTick` in the player's holdings. While it is
 * open, firedamp's drain plays at the flask's factor (−100%: none at all). Since ticket 882 the
 * rig's cell at the uncork is kept too, `flaskAt`, the centre of the firedamp the flask clears
 * for its window (`flaskClear.ts`).
 *
 * Refused, costing nothing, while no flask is carried (`no_flask`) or one is still open
 * (`flask_open`). It is answered by `planet-kit.FlaskUncorked`, logged as `flask_uncorked`.
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import type { ContactFactor } from '../../../systems/registries/contactEffects'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { flaskUncorkedOf } from './flaskEvents'
import {
  heldCountOf,
  isFlaskOpenAt,
  spendConsumable,
  withFlaskOpen,
  type KitSpend,
} from './kitHoldings'
import { kitHoldingsOf, withKitHoldings } from './kitHoldingsSection'
import { PLANET_KIT_ECONOMY, PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

const FLASK_ACTING = PLANET_KIT_ECONOMY.acting.flask
const FLASK = kitItemOf(PLANET_KITS, FLASK_ACTING.itemId) as KitItem

export const UNCORK_FLASK_INTENT: CommandIntent<'planet-kit.uncork_flask'> = {
  type: 'planet-kit.uncork_flask',
  payload: {},
}

export const FLASK_RULES: SliceCommandRules = {
  'planet-kit.uncork_flask': {
    fields: {},
    reject: (state, { playerId, tick }) => uncorkRejectionOf(state, playerId, tick),
    apply: (state, { playerId, tick }) => uncorkFlask(state, playerId, tick),
  },
}

/** The flask's factor on its hazard's contacts while one is open. */
export const FLASK_FACTOR: ContactFactor = {
  id: `planet-kit.${FLASK.id}`,
  kind: FLASK.effect.hazard as string,
  factorBpOf: (state, playerId) =>
    isFlaskOpenAt(kitHoldingsOf(state, playerId), state.tick) ? FLASK_ACTING.factorBp : null,
}

/** Why an uncork would be refused at `tick`; null when it would land. */
export function uncorkRejectionOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
): Rejection | null {
  const holdings = kitHoldingsOf(state, playerId)
  return firstRejection([
    () => noFlaskRejection(heldCountOf(holdings, FLASK.id)),
    () => (isFlaskOpenAt(holdings, tick) ? flaskOpenRejection(holdings.flaskUntilTick) : null),
  ])
}

/** The flasks the player carries and whether one is open at `tick`, for the bar and the bot. */
export function flaskStateOf(state: AuthorityState, playerId: string, tick: number) {
  const holdings = kitHoldingsOf(state, playerId)
  return { carried: heldCountOf(holdings, FLASK.id), isOpen: isFlaskOpenAt(holdings, tick) }
}

function uncorkFlask(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const spent = spendConsumable(kitHoldingsOf(state, playerId), FLASK.id) as KitSpend
  const untilTick = tick + FLASK_ACTING.openTicks
  const at = rigCellOf(vehicleOf(state, playerId))
  const holdings = withFlaskOpen(spent.holdings, { untilTick, at })
  return {
    state: withKitHoldings(state, playerId, holdings),
    events: [
      flaskUncorkedOf({
        playerId,
        itemId: FLASK.id,
        boughtAt: spent.boughtAt,
        untilTick,
        left: heldCountOf(holdings, FLASK.id),
        at,
      }),
    ],
  }
}

function rigCellOf(vehicle: VehicleState): TilePoint | null {
  return vehicle.pose === null ? null : tileOfPose(vehicle.pose)
}

function noFlaskRejection(carried: bigint): Rejection | null {
  if (carried > 0n) return null
  return rejectionOf('planet-kit.no_flask', `no ${FLASK.id} is carried`)
}

function flaskOpenRejection(untilTick: number | undefined): Rejection {
  return rejectionOf('planet-kit.flask_open', `a flask is open until tick ${String(untilTick)}`)
}
