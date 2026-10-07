/**
 * The command rules `power-up-core` registers (feature-slices.md 3.15):
 *
 * - `power-up-core.use_power_up {slot}`: press the power-up in a slot. Refused, at no cost, for the
 *   reasons in `useRefusals.ts`; accepted, it reserves a charge and winds up or channels.
 * - `power-up-core.toggle_link {itemId}`: the item card's switch for the item's sibling-link
 *   (ticket 274), refused for an item whose Mark has reached none (`linkToggle.ts`).
 * - `debug.power-up-core.setCharges {itemId, chargesLeft}`: a scenario's charges left for one
 *   power-up that counts charges, at most the count at the player's Mark (#249).
 */
import { rejectionOf, type Rejection } from '../../../systems/authority/commandRule'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { itemChargesOf, powerUpStateOf, withItemCharges, withPowerUpState } from './chargeState'
import './powerUpEvents'
import { linkToggleRefusalOf, toggleSiblingLink } from './linkToggle'
import { hasCharges, type PowerUp } from './powerUpKind'
import { powerUpAtMarkOf } from './powerUpMarks'
import { slottedPowerUpOf, refusalOfUse } from './useRefusals'
import { startUse } from './useResolution'

export const POWER_UP_RULES: SliceCommandRules = {
  'power-up-core.use_power_up': {
    fields: { slot: 'text' },
    reject: (state, { playerId, tick, payload }) =>
      refusalOfUse(state, playerId, payload.slot, tick),
    apply: (state, { playerId, tick, payload }) => {
      const slot = payload.slot as LoadoutSlotId
      const powerUp = slottedPowerUpOf(vehicleOf(state, playerId), slot) as PowerUp
      return startUse(state, playerId, powerUp, slot, tick)
    },
  },
  'power-up-core.toggle_link': {
    fields: { itemId: 'text' },
    reject: (state, { playerId, payload }) => linkToggleRefusalOf(state, playerId, payload.itemId),
    apply: (state, { playerId, payload }) => toggleSiblingLink(state, playerId, payload.itemId),
  },
  'debug.power-up-core.setCharges': {
    fields: { itemId: 'text', chargesLeft: 'wholeNumber' },
    reject: (state, { playerId, payload }) =>
      chargesRefusalOf(powerUpAtMarkOf(state, playerId, payload.itemId), payload),
    apply: (state, { playerId, payload }) => ({
      state: withChargesLeft(state, playerId, payload.itemId, payload.chargesLeft),
      events: [],
    }),
  },
}

function chargesRefusalOf(
  powerUp: PowerUp | null,
  { itemId, chargesLeft }: { itemId: string; chargesLeft: number },
): Rejection | null {
  if (powerUp === null || !hasCharges(powerUp))
    return rejectionOf('power-up-core.invalid_charges', `"${itemId}" counts no charges`)
  if (chargesLeft <= powerUp.charges) return null
  return rejectionOf(
    'power-up-core.invalid_charges',
    `"${itemId}" holds at most ${powerUp.charges} charges`,
  )
}

function withChargesLeft(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  chargesLeft: number,
): AuthorityState {
  const powerUp = powerUpAtMarkOf(state, playerId, itemId) as PowerUp
  const value = powerUpStateOf(state, playerId)
  const charges = { ...itemChargesOf(value, itemId), spent: powerUp.charges - chargesLeft }
  return withPowerUpState(state, playerId, withItemCharges(value, itemId, charges))
}
