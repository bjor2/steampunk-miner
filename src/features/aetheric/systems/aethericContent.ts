/**
 * The lane's shipped rows as the kernel and the slices take them (#245): the resonance whistle's
 * `vehicle-item` row, `power-up` entry and item card (#262). The chronometric governor and the
 * aether condenser (#263) and the P16 fork pair (#261) come with their own builds; until then
 * their nodes unlock items nothing sells.
 */
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import { WHISTLE_ITEM_CARD } from './itemCards'
import { whistlePowerUp } from './resonanceWhistle'
import { WHISTLE_VEHICLE_ITEM } from './whistleItem'

export const AETHERIC_VEHICLE_ITEMS: readonly VehicleItem[] = [WHISTLE_VEHICLE_ITEM]

export const AETHERIC_POWER_UPS: readonly PowerUp[] = [whistlePowerUp()]

export const AETHERIC_ITEM_CARDS: readonly ItemDescriptionEntry[] = [WHISTLE_ITEM_CARD]
