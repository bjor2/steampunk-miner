/**
 * The ground-gun's run-log lines (ticket 314; logging from the start, design 37.5): the mount and
 * every track level carry what they cost and the `armoury` family, so the #212 spend guard and the
 * spend-share analysis are derived from the log. Refusals are the kernel's `command_rejected`, and
 * the wallet's `MoneyChanged` logs nothing of its own, as on the kernel's buys. The shots are the
 * kernel's `bore_fired` and `bore_ended`; a bored ore unit picked up is the kernel's cargo line,
 * and one the trip's income cap had no room for is `ground-gun.bored_ore_capped {value}`. A charged
 * signature module's spent charge is `ground-gun.module_charge_spent {itemId, chargesLeft}`, and the
 * dock's free restock `ground-gun.module_charges_refilled {itemId, chargesLeft}` (ticket 380). The
 * cells a cementing round's line held as permanent ground are `ground-gun.shot_cells_reinforced
 * {cells, type, price}`, priced onto the lining bill like `casing_lined` (ticket 369).
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { ARMOURY_FAMILY } from './systems/boreGunContent'
import { GUN_TRACK_IDS } from './systems/groundGunEconomy'
import './systems/borePickup'
import './systems/moduleUseReaction'
import './systems/shoringShot'
import './systems/gunPurchase'

export const GROUND_GUN_PROJECTIONS: SliceEventProjections = {
  'ground-gun.GunMounted': ({ price }) => ({
    event: 'ground-gun.gun_mounted',
    data: { family: ARMOURY_FAMILY, price },
  }),
  'ground-gun.TrackLevelBought': ({ track, from, to, price }) => ({
    event: 'ground-gun.track_level_bought',
    data: { family: ARMOURY_FAMILY, track, from, to, price },
  }),
  'ground-gun.BoredOreCapped': ({ value }) => ({
    event: 'ground-gun.bored_ore_capped',
    data: { value },
  }),
  'ground-gun.ModuleChargeSpent': ({ itemId, chargesLeft }) => ({
    event: 'ground-gun.module_charge_spent',
    data: { itemId, chargesLeft },
  }),
  'ground-gun.ModuleChargesRefilled': ({ itemId, chargesLeft }) => ({
    event: 'ground-gun.module_charges_refilled',
    data: { itemId, chargesLeft },
  }),
  'ground-gun.ShotCellsReinforced': ({ cells, liningType, price }) => ({
    event: 'ground-gun.shot_cells_reinforced',
    data: { cells, type: liningType, price },
  }),
}

export const GROUND_GUN_RUN_EVENTS: SliceRunEvents = {
  'ground-gun.gun_mounted': {
    group: 'progression',
    level: 'core',
    payload: { family: { oneOf: [ARMOURY_FAMILY] }, price: 'money' },
  },
  'ground-gun.track_level_bought': {
    group: 'progression',
    level: 'core',
    payload: {
      family: { oneOf: [ARMOURY_FAMILY] },
      track: { oneOf: GUN_TRACK_IDS },
      from: 'integer',
      to: 'integer',
      price: 'money',
    },
  },
  'ground-gun.bored_ore_capped': {
    group: 'mining',
    level: 'core',
    payload: { value: 'money' },
  },
  'ground-gun.module_charge_spent': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', chargesLeft: 'integer' },
  },
  'ground-gun.module_charges_refilled': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { itemId: 'text', chargesLeft: 'integer' },
  },
  'ground-gun.shot_cells_reinforced': {
    group: 'mining',
    level: 'core',
    payload: { cells: 'integer', type: 'text', price: 'money' },
  },
}
