/**
 * The aetheric lines (#162 section 2.4: the envelope carries planet, depth and tick). Every use is
 * already `power-up-core.power_up_used`; the lock on #245 adds one `aetheric.*` line saying what the
 * use did:
 *
 * - `whistle_sounded {itemId, tx, ty, reachTiles, durationTicks, energy}` (#262): where the whistle
 *   sounded, how far and how long it lures, and the energy quanta it took.
 * - `pocket_opened {itemId, tx, ty, rangeTiles, durationTicks, energyPerTick, heat}` (#263): where
 *   the governor's pocket opened, how far and how long it slows, the quanta it draws a tick, and the
 *   heat units it put on the item gauge.
 * - `heat_condensed {itemId, heat, energy}` (#263): the heat units the condenser burnt and the
 *   energy quanta they made.
 *
 * A press that cannot act is `power-up-core.power_up_refused` with an `aetheric.*` reason: the tank
 * cannot pay (`energy_short`), it is full (`tank_full`), or the gauge holds no heat (`no_heat`).
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/aethericEvents'

export const WHISTLE_SOUNDED_EVENT = 'aetheric.whistle_sounded'
export const POCKET_OPENED_EVENT = 'aetheric.pocket_opened'
export const HEAT_CONDENSED_EVENT = 'aetheric.heat_condensed'

export const AETHERIC_PROJECTIONS: SliceEventProjections = {
  'aetheric.WhistleSounded': ({ itemId, tx, ty, reachTiles, durationTicks, energy }) => ({
    event: WHISTLE_SOUNDED_EVENT,
    data: { itemId, tx, ty, reachTiles, durationTicks, energy },
  }),
  'aetheric.PocketOpened': ({
    itemId,
    tx,
    ty,
    rangeTiles,
    durationTicks,
    energyPerTick,
    heat,
  }) => ({
    event: POCKET_OPENED_EVENT,
    data: { itemId, tx, ty, rangeTiles, durationTicks, energyPerTick, heat },
  }),
  'aetheric.HeatCondensed': ({ itemId, heat, energy }) => ({
    event: HEAT_CONDENSED_EVENT,
    data: { itemId, heat, energy },
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
  [POCKET_OPENED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      tx: 'integer',
      ty: 'integer',
      rangeTiles: 'integer',
      durationTicks: 'integer',
      energyPerTick: 'integer',
      heat: 'integer',
    },
  },
  [HEAT_CONDENSED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', heat: 'integer', energy: 'integer' },
  },
}
