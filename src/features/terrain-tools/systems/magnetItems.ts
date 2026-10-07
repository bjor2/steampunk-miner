/**
 * The terrain magnets family's new members (GD lock on #246; card copy from Content on #282):
 * the repulsor coil (repel, a slot tap) and the lode clamp (anchor, a slot hold). The lodestone
 * beacon stays the attract member exactly as `terrainItems.ts` lists it.
 *
 * Data only (ticket 282, build 1 of the lock): the family enters at P25 with the magnetic planet,
 * so until the #71 magnetic-planet spec exists nothing here is registered and no store, tree, item
 * card or bot sees them. The nodes and their prerequisites are ticket 300's; the effects are
 * builds 2-4. A separate list from `TERRAIN_ITEMS`, so registering the lane does not ship them.
 */
import type { ItemAttach } from '../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId, VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import type { MarkLadder, ProgressionLabel } from '../../tech-tree'
import { TERRAIN_ECONOMY, type TerrainBalance } from './terrainEconomy'

/** The one #212 spend-guard row the whole family shares (Systems, 7 Oct). */
export const TERRAIN_MAGNETS_FAMILY = 'terrain_magnets'

export type MagnetVerb = 'repel' | 'anchor'

/** How the slot drives it (#164): one push-wave per tap, or a field held while held. */
export type MagnetInput = 'tap' | 'hold'

/** The value a card line prints; its template names it as `{<reading>}`. */
export type MagnetReading = 'maxCellsMoved' | 'radius' | 'duration'

/** One stat line of the card, as Content wrote it, with its number left as a placeholder. */
export interface MagnetCardLine {
  label: string
  /** The text after the label, holding `{<reading>}` where the number goes. */
  template: string
  reading: MagnetReading
}

export interface MagnetItem {
  itemId: string
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  familyId: typeof TERRAIN_MAGNETS_FAMILY
  verb: MagnetVerb
  input: MagnetInput
  label: ProgressionLabel
  slots: readonly LoadoutSlotId[]
  attach: ItemAttach
  /** What the Mark magnitude step grows: the wave's radius in cells, or the hold's ticks. */
  magnitudeReading: Exclude<MagnetReading, 'maxCellsMoved'>
  cardLines: readonly MagnetCardLine[]
  /** The capability node ticket 300 registers, and the planet the lock unlocks it on. */
  node: { id: string; unlockTier: number }
}

export const MAGNET_ITEMS: readonly MagnetItem[] = [
  {
    itemId: 'power.repulsor_coil',
    name: 'Repulsor coil',
    iconId: 'item-power-repulsor-coil',
    description: 'A brass ring that shoves the ground away in one hard pulse.',
    familyId: TERRAIN_MAGNETS_FAMILY,
    verb: 'repel',
    input: 'tap',
    label: 'horizontal',
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    magnitudeReading: 'radius',
    cardLines: [
      {
        label: 'Tap',
        template:
          'pushes loose rubble, metal-part enemies and up to {maxCellsMoved} diggable cells one cell outward into open space',
        reading: 'maxCellsMoved',
      },
      { label: 'Wave radius', template: '{radius} cells', reading: 'radius' },
    ],
    node: { id: 'tech.terrain.repulsor_coil', unlockTier: 25 },
  },
  {
    itemId: 'power.lode_clamp',
    name: 'Lode clamp',
    iconId: 'item-power-lode-clamp',
    description: 'A brass lattice that locks the rock in place for as long as you hold it.',
    familyId: TERRAIN_MAGNETS_FAMILY,
    verb: 'anchor',
    input: 'hold',
    label: 'horizontal',
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    magnitudeReading: 'duration',
    cardLines: [
      {
        label: 'Hold',
        template:
          'pins loose rubble and up to {maxCellsMoved} diggable cells against collapse and moves nothing',
        reading: 'maxCellsMoved',
      },
      { label: 'Lasts up to', template: '{duration}', reading: 'duration' },
    ],
    node: { id: 'tech.terrain.lode_clamp', unlockTier: 28 },
  },
]

/** The family member sold as `itemId`, or null for any other item. */
export function magnetItemOf(itemId: string): MagnetItem | null {
  return MAGNET_ITEMS.find((item) => item.itemId === itemId) ?? null
}

/** The item's `items.balance.<id>` row in terrain-tools.economy.json; every member has one. */
export function magnetBalanceOf(item: MagnetItem): TerrainBalance {
  const balance = TERRAIN_ECONOMY.balance[item.itemId]
  if (balance === undefined) throw new RangeError(`no items.balance row for ${item.itemId}`)
  return balance
}

export function magnetVehicleItemOf(item: MagnetItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: item.slots, attach: item.attach }
}

/**
 * The tree's Mark rotation (#162 4.6) over the lock's ladder: cooldown x0.92 down to 0.5x (600 of
 * 1200, the family's tick floor), magnitude x1.15 up to 2x, charges +1 up to +3. Not an income
 * item: the 0.7x floor would stop the cooldown at 840, above the floor the lock names.
 */
export function magnetMarkLadderOf(item: MagnetItem): MarkLadder {
  const balance = magnetBalanceOf(item)
  return {
    isIncomeItem: false,
    ...(balance.cooldownTicks !== undefined && { cooldown: balance.cooldownTicks }),
    magnitude: { base: balance.magnitude },
    charges: balance.charges,
  }
}
