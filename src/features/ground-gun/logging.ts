/**
 * The ground-gun's run-log lines (ticket 314; logging from the start, design 37.5): the mount and
 * every track level carry what they cost and the `armoury` family, so the #212 spend guard and the
 * spend-share analysis are derived from the log. Refusals are the kernel's `command_rejected`, and
 * the wallet's `MoneyChanged` logs nothing of its own, as on the kernel's buys. The shots are the
 * kernel's `bore_fired` and `bore_ended`; a bored ore unit picked up is the kernel's cargo line,
 * and one the trip's income cap had no room for is `ground-gun.bored_ore_capped {value}`.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { ARMOURY_FAMILY } from './systems/boreGunContent'
import { GUN_TRACK_IDS } from './systems/groundGunEconomy'
import './systems/borePickup'
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
}
