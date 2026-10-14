/**
 * The lane's shipped rows as the kernel and the slices take them (#245): the `vehicle-item` row,
 * `power-up` entry and item card of the resonance whistle (#262), the P16 fork pair's phase
 * lantern and galvanic arc coil (#261), the chronometric governor and the aether condenser (#263).
 */
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUp } from '../../power-up-core'
import { condenserPowerUp } from './aetherCondenser'
import { arcCoilPowerUp } from './arcCoil'
import { ARC_COIL_VEHICLE_ITEM } from './arcCoilItem'
import { governorPowerUp } from './chronometricGovernor'
import { CONDENSER_VEHICLE_ITEM } from './condenserItem'
import { GOVERNOR_VEHICLE_ITEM } from './governorItem'
import {
  ARC_COIL_ITEM_CARD,
  CONDENSER_ITEM_CARD,
  GOVERNOR_ITEM_CARD,
  LANTERN_ITEM_CARD,
  WHISTLE_ITEM_CARD,
} from './itemCards'
import { LANTERN_VEHICLE_ITEM } from './lanternItem'
import { lanternPowerUp } from './phaseLantern'
import { phaseHoldOf } from './phaseMoves'
import { whistlePowerUp } from './resonanceWhistle'
import { WHISTLE_VEHICLE_ITEM } from './whistleItem'

export const AETHERIC_VEHICLE_ITEMS: readonly VehicleItem[] = [
  WHISTLE_VEHICLE_ITEM,
  LANTERN_VEHICLE_ITEM,
  ARC_COIL_VEHICLE_ITEM,
  GOVERNOR_VEHICLE_ITEM,
  CONDENSER_VEHICLE_ITEM,
]

export const AETHERIC_POWER_UPS: readonly PowerUp[] = [
  whistlePowerUp(),
  lanternPowerUp(phaseHoldOf),
  arcCoilPowerUp(),
  governorPowerUp(),
  condenserPowerUp(),
]

export const AETHERIC_ITEM_CARDS: readonly ItemDescriptionEntry[] = [
  WHISTLE_ITEM_CARD,
  LANTERN_ITEM_CARD,
  ARC_COIL_ITEM_CARD,
  GOVERNOR_ITEM_CARD,
  CONDENSER_ITEM_CARD,
]
