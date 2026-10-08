/**
 * The power-up log lines (#162 section 2.4, Systems on #200): `power_up_used` (naming the Mark
 * milestone a follow-up use was, #256), `power_up_blocked_by_gate`, `power_up_refused` for a use
 * with nothing to act on (ticket 204), `power_up_cancelled` for a broken channel, and
 * `charges_refilled` for each free dock refill. The envelope already carries planet, depth and
 * tick. The sibling-link milestone (the GD lock on #256, ticket 274) adds `link_fired {itemId,
 * siblingId, slot}`, the sibling's slot, and `link_toggled {itemId, isOn}` for the item card's
 * switch. Letting go of a hold-to-use slot (ticket 332) logs `power_up_released {itemId, slot}`
 * on the tick the hold ended.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/powerUpEvents'

export const POWER_UP_PROJECTIONS: SliceEventProjections = {
  'power-up-core.PowerUpUsed': (used) => ({
    event: 'power-up-core.power_up_used',
    data: {
      itemId: used.itemId,
      mark: used.mark,
      slot: used.slot,
      origin: { tx: used.originTx, ty: used.originTy },
      chargesLeft: used.chargesLeft,
      ...(used.toggledOn === undefined ? {} : { toggledOn: used.toggledOn }),
      ...(used.milestone === undefined ? {} : { milestone: used.milestone }),
    },
  }),
  'power-up-core.PowerUpBlocked': ({ itemId, cellTier, gateKind, tx, ty }) => ({
    event: 'power-up-core.power_up_blocked_by_gate',
    data: { itemId, cellTier, gateKind, tx, ty },
  }),
  'power-up-core.PowerUpRefused': ({ itemId, slot, reason, chargesLeft }) => ({
    event: 'power-up-core.power_up_refused',
    data: { itemId, slot, reason, chargesLeft },
  }),
  'power-up-core.ChannelCancelled': ({ itemId, slot, chargesLeft }) => ({
    event: 'power-up-core.power_up_cancelled',
    data: { itemId, slot, chargesLeft },
  }),
  'power-up-core.ChargesRefilled': ({ itemId, chargesLeft }) => ({
    event: 'power-up-core.charges_refilled',
    data: { itemId, to: chargesLeft },
  }),
  'power-up-core.LinkFired': ({ itemId, siblingId, slot }) => ({
    event: 'power-up-core.link_fired',
    data: { itemId, siblingId, slot },
  }),
  'power-up-core.LinkToggled': ({ itemId, isOn }) => ({
    event: 'power-up-core.link_toggled',
    data: { itemId, isOn },
  }),
  'power-up-core.PowerUpReleased': ({ itemId, slot }) => ({
    event: 'power-up-core.power_up_released',
    data: { itemId, slot },
  }),
}

export const POWER_UP_RUN_EVENTS: SliceRunEvents = {
  'power-up-core.power_up_used': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      mark: 'integer',
      slot: 'text',
      origin: { mapOf: 'integer' },
      chargesLeft: 'integer',
      toggledOn: { optional: 'flag' },
      milestone: { optional: 'text' },
    },
  },
  'power-up-core.power_up_blocked_by_gate': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      cellTier: 'integer',
      gateKind: 'text',
      tx: 'integer',
      ty: 'integer',
    },
  },
  'power-up-core.power_up_refused': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', slot: 'text', reason: 'text', chargesLeft: 'integer' },
  },
  'power-up-core.power_up_cancelled': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', slot: 'text', chargesLeft: 'integer' },
  },
  'power-up-core.charges_refilled': {
    group: 'platform',
    level: 'core',
    payload: { itemId: 'text', to: 'integer' },
  },
  'power-up-core.link_fired': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', siblingId: 'text', slot: 'text' },
  },
  'power-up-core.link_toggled': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', isOn: 'flag' },
  },
  'power-up-core.power_up_released': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', slot: 'text' },
  },
}
