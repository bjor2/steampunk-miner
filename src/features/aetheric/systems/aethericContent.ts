/**
 * The lane's shipped rows as the kernel and the slices take them (#245): the `vehicle-item` row,
 * `power-up` entry and item card of the resonance whistle (#262), the chronometric governor and
 * the aether condenser (#263). The P16 fork pair (#261) comes with its own build; until then its
 * nodes unlock items nothing sells.
 */
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import { condenserPowerUp } from './aetherCondenser'
import { governorPowerUp } from './chronometricGovernor'
import { CONDENSER_VEHICLE_ITEM } from './condenserItem'
import { GOVERNOR_VEHICLE_ITEM } from './governorItem'
import { CONDENSER_ITEM_CARD, GOVERNOR_ITEM_CARD, WHISTLE_ITEM_CARD } from './itemCards'
import { whistlePowerUp } from './resonanceWhistle'
import { WHISTLE_VEHICLE_ITEM } from './whistleItem'

export const AETHERIC_VEHICLE_ITEMS: readonly VehicleItem[] = [
  WHISTLE_VEHICLE_ITEM,
  GOVERNOR_VEHICLE_ITEM,
  CONDENSER_VEHICLE_ITEM,
]

export const AETHERIC_POWER_UPS: readonly PowerUp[] = [
  whistlePowerUp(),
  governorPowerUp(),
  condenserPowerUp(),
]

export const AETHERIC_ITEM_CARDS: readonly ItemDescriptionEntry[] = [
  WHISTLE_ITEM_CARD,
  GOVERNOR_ITEM_CARD,
  CONDENSER_ITEM_CARD,
]
