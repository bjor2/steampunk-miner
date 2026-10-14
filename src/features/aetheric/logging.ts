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
 * - `phase_started {itemId, cellTx, cellTy, toTx, toTy, ticks, energy, heat}` (#261): the cell the
 *   lantern phases the vehicle through, the cell it lands in, the ticks the move takes (the bit's
 *   on that cell), the energy quanta it took and the heat units it put on the gauge. The landing is
 *   `phase_landed {tx, ty}`; a landing cell closed mid-phase is `phase_reversed {tx, ty, ticks}`,
 *   then `phase_returned {tx, ty}` back in the start cell. The #267 action mix counts descent cells
 *   crossed by phasing off `phase_landed`.
 * - `arc_fired {itemId, targets, damage, energy, heat}` (#261): how many enemies the bolt hit, the
 *   damage each took (one auto-gun shot, canonical), the energy quanta and the heat units. The
 *   #267 action mix reads enemy damage from arcs as `targets` times `damage`.
 *
 * A press that cannot act is `power-up-core.power_up_refused` with an `aetheric.*` reason: the tank
 * cannot pay (`energy_short`), it is full (`tank_full`), the gauge holds no heat (`no_heat`), the
 * lantern finds no cell to phase or no landing (`nothing_ahead`, `cell_locked`, `cell_dense`,
 * `cell_gated`, `core_cell`, `no_landing`, `phasing`), or the coil finds no enemy (`no_target`).
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/aethericEvents'

export const WHISTLE_SOUNDED_EVENT = 'aetheric.whistle_sounded'
export const POCKET_OPENED_EVENT = 'aetheric.pocket_opened'
export const HEAT_CONDENSED_EVENT = 'aetheric.heat_condensed'
export const PHASE_STARTED_EVENT = 'aetheric.phase_started'
export const PHASE_LANDED_EVENT = 'aetheric.phase_landed'
export const PHASE_REVERSED_EVENT = 'aetheric.phase_reversed'
export const PHASE_RETURNED_EVENT = 'aetheric.phase_returned'
export const ARC_FIRED_EVENT = 'aetheric.arc_fired'

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
  'aetheric.PhaseStarted': ({ itemId, cellTx, cellTy, toTx, toTy, ticks, energy, heat }) => ({
    event: PHASE_STARTED_EVENT,
    data: { itemId, cellTx, cellTy, toTx, toTy, ticks, energy, heat },
  }),
  'aetheric.PhaseLanded': ({ tx, ty }) => ({ event: PHASE_LANDED_EVENT, data: { tx, ty } }),
  'aetheric.PhaseReversed': ({ tx, ty, ticks }) => ({
    event: PHASE_REVERSED_EVENT,
    data: { tx, ty, ticks },
  }),
  'aetheric.PhaseReturned': ({ tx, ty }) => ({ event: PHASE_RETURNED_EVENT, data: { tx, ty } }),
  'aetheric.ArcFired': ({ itemId, targets, damage, energy, heat }) => ({
    event: ARC_FIRED_EVENT,
    data: { itemId, targets, damage, energy, heat },
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
  [PHASE_STARTED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      cellTx: 'integer',
      cellTy: 'integer',
      toTx: 'integer',
      toTy: 'integer',
      ticks: 'integer',
      energy: 'integer',
      heat: 'integer',
    },
  },
  [PHASE_LANDED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer' },
  },
  [PHASE_REVERSED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer', ticks: 'integer' },
  },
  [PHASE_RETURNED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { tx: 'integer', ty: 'integer' },
  },
  [ARC_FIRED_EVENT]: {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: {
      itemId: 'text',
      targets: 'integer',
      damage: 'text',
      energy: 'integer',
      heat: 'integer',
    },
  },
}
