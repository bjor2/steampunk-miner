/**
 * The aetheric line (#162 section 2.4: the envelope carries planet, depth and tick). Every use is
 * already `power-up-core.power_up_used`; the lock on #245 adds one `aetheric.*` line saying what the
 * use did: `whistle_sounded {itemId, tx, ty, reachTiles, durationTicks, energy}`, where the whistle
 * sounded, how far and how long it lures, and the energy quanta it took. A press the tank cannot
 * pay is `power-up-core.power_up_refused {reason: aetheric.energy_short}`.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/aethericEvents'

export const WHISTLE_SOUNDED_EVENT = 'aetheric.whistle_sounded'

export const AETHERIC_PROJECTIONS: SliceEventProjections = {
  'aetheric.WhistleSounded': ({ itemId, tx, ty, reachTiles, durationTicks, energy }) => ({
    event: WHISTLE_SOUNDED_EVENT,
    data: { itemId, tx, ty, reachTiles, durationTicks, energy },
  }),
}

export const AETHERIC_RUN_EVENTS: SliceRunEvents = {
  [WHISTLE_SOUNDED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      tx: 'integer',
      ty: 'integer',
      reachTiles: 'integer',
      durationTicks: 'integer',
      energy: 'integer',
    },
  },
}
