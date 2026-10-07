/**
 * The power-up log lines (#162 section 2.4, Systems on #200): `power_up_used`,
 * `power_up_blocked_by_gate`, `power_up_cancelled` for a broken channel, and `charges_refilled`
 * for each free dock refill. The envelope already carries planet, depth and tick.
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
    },
  }),
  'power-up-core.PowerUpBlocked': ({ itemId, cellTier, gateKind, tx, ty }) => ({
    event: 'power-up-core.power_up_blocked_by_gate',
    data: { itemId, cellTier, gateKind, tx, ty },
  }),
  'power-up-core.ChannelCancelled': ({ itemId, slot, chargesLeft }) => ({
    event: 'power-up-core.power_up_cancelled',
    data: { itemId, slot, chargesLeft },
  }),
  'power-up-core.ChargesRefilled': ({ itemId, chargesLeft }) => ({
    event: 'power-up-core.charges_refilled',
    data: { itemId, to: chargesLeft },
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
}
