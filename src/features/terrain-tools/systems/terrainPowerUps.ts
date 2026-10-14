/**
 * Each shipped terrain tool as `power-up-core` runs it (#162 section 2.1 classes, 4.2 and 4.3
 * numbers): the charged shifter and pocket lance refill at the dock, the splitter and lodestone come
 * as a stack. When the wind-up ends the tool plans its whole edit on the state the act sees, at the
 * Mark the player researched (#249), and the edit joins the K6 queue on that tick
 * (`terrainOutcome.ts`). The repulsor coil (ticket 284), a charged magnet, releases its push-wave
 * through the kernel's magnet shift instead (`repulsorCoil.ts`). The lode clamp (ticket 285) is
 * used by holding its slot: its act locks a field, and letting go ends it (`lodeClamp.ts`). With
 * the Ore Lure twist held, the shifter leaves its plate or drags toward it (`oreLure.ts`, ticket
 * 329). A Mark milestone's second tap or hold, and a sibling-link's reduced size, reach the planner
 * as its verb (`toolVerb.ts`, #256).
 */
import type { PowerUp } from '../../power-up-core'
import { editWith, type Activate } from './editActivation'
import { LODESTONE_BEACON_ID, plantLodestone } from './lodestoneBeacon'
import { clampHoldOf, LODE_CLAMP_ID, lockClampField, releaseClampField } from './lodeClamp'
import { magnetBalanceOf, type MagnetItem } from './magnetItems'
import { dragOrLureOre } from './oreLure'
import { ORE_SHIFTER_ID } from './oreShifter'
import { planPressurePocket, PRESSURE_POCKET_ID } from './pressurePocket'
import { releasePushWave, REPULSOR_COIL_ID } from './repulsorCoil'
import { planSeamSplit, SEAM_SPLITTER_ID } from './seamSplitter'
import { SHIPPED_MAGNET_ITEMS, SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { balanceOf, isConsumable, type TerrainItem } from './terrainItems'
import { editSourceOf } from './terrainOutcome'

const ACTIVATIONS: Readonly<Record<string, Activate>> = {
  [ORE_SHIFTER_ID]: dragOrLureOre,
  [SEAM_SPLITTER_ID]: editWith(planSeamSplit),
  [PRESSURE_POCKET_ID]: editWith(planPressurePocket),
  [LODESTONE_BEACON_ID]: plantLodestone,
  [REPULSOR_COIL_ID]: releasePushWave,
  [LODE_CLAMP_ID]: lockClampField,
}

/** A magnet used by holding its slot (#164 `hold`): its hold for the slot's ring, and its release. */
type HoldHooks = Required<Pick<PowerUp, 'holdOf' | 'release'>>

const HOLD_HOOKS: Readonly<Record<string, HoldHooks>> = {
  [LODE_CLAMP_ID]: { holdOf: clampHoldOf, release: releaseClampField },
}

export const TERRAIN_POWER_UPS: readonly PowerUp[] = [
  ...SHIPPED_TERRAIN_ITEMS.map(powerUpOf),
  ...SHIPPED_MAGNET_ITEMS.map(magnetPowerUpOf),
]

function powerUpOf(item: TerrainItem): PowerUp {
  const balance = balanceOf(item)
  return {
    id: editSourceOf(item.itemId),
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    powerUpClass: item.powerUpClass,
    charges: balance.charges,
    cooldownTicks: isConsumable(item) ? 0 : (balance.cooldownTicks ?? 0),
    windupTicks: balance.windupTicks ?? 0,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: ACTIVATIONS[item.itemId],
  }
}

/**
 * A terrain magnet is a charged item: its charges refill at the dock, its cooldown runs per use (a
 * held one's again from the hold's end).
 */
function magnetPowerUpOf(item: MagnetItem): PowerUp {
  const balance = magnetBalanceOf(item)
  return {
    id: editSourceOf(item.itemId),
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks ?? 0,
    windupTicks: balance.windupTicks ?? 0,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: ACTIVATIONS[item.itemId],
    ...HOLD_HOOKS[item.itemId],
  }
}
