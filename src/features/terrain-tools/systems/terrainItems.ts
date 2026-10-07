/**
 * The terrain lane's store items (spec #162 section 1, the terrain manipulation table; #161
 * section 1 for the tree nodes): stabiliser foam, the ore-shifter, the seam splitter, the pressure
 * pocket lance, the cryo binder, the lodestone beacon, shoring props and the strata press, as
 * catalogue rows, and the `vehicle-item` rows, tech nodes and prices made from them. The fourth
 * cradle on this lane is `power-up-core`'s; the spoil auger is drill gear.
 *
 * Vision rows (ticket 240, the data half of #202): nothing here is registered, so no store, tree,
 * item card or bot sees them; #202 registers them with the effect.
 */
import type { Money } from '../../../systems/money'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { ItemAttach } from '../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId, VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS, type PowerUpClass } from '../../power-up-core'
import type { DiscoveryRequirement, MarkLadder, ProgressionLabel, TechNode } from '../../tech-tree'
import { TERRAIN_ECONOMY, type TerrainBalance } from './terrainEconomy'

/** The unit a terrain item's size is counted in, as its stat line prints it. */
export type TerrainSizeUnit = 'cells' | 'tiles'

/** One store item of the lane, as #162 and #161 write it. */
export interface TerrainItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  label: ProgressionLabel
  powerUpClass: Extract<PowerUpClass, 'charged' | 'consumable'>
  /** Moves ore (#161 `incomeItem`): the tighter Mark floor and cap (#162 4.6). */
  isIncomeItem: boolean
  slots: readonly LoadoutSlotId[]
  /** Charged items draw at their slot's `hull.powerup.n`; consumables are crates on the rack. */
  attach: ItemAttach
  /** What `reachTiles` means for this item, as a card names it; null when it has none. */
  reachLabel: string | null
  /** What `magnitude` means for this item, and its unit. */
  sizeLabel: string
  sizeUnit: TerrainSizeUnit
  node: TerrainNode
}

/** The item's capability node (#161 section 1). */
export interface TerrainNode {
  id: string
  iconId: string
  /** The unlock planet; a charged item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryRequirement
}

/** A crate on the `hull.rear` charge rack (TD: the crates extend that rack asset). */
const RACK_CRATE: ItemAttach = 'hull.rear'

export const TERRAIN_ITEMS: readonly TerrainItem[] = [
  {
    itemId: 'consumable.stabiliser_foam',
    name: 'Stabiliser foam',
    iconId: 'item-consumable-stabiliser-foam',
    description: 'Setting foam that cures into a ceramic crust along the tunnel wall.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    isIncomeItem: false,
    slots: POWER_UP_SLOTS,
    attach: RACK_CRATE,
    reachLabel: 'Cone',
    sizeLabel: 'Cells braced',
    sizeUnit: 'cells',
    node: {
      id: 'tech.terrain.stabiliser_foam',
      iconId: 'node-terrain-stabiliser-foam',
      unlockTier: 3,
      prereqs: [],
    },
  },
  {
    itemId: 'power.ore_shifter',
    name: 'Magnetic ore-shifter',
    iconId: 'item-power-ore-shifter',
    description: 'A field coil drags loose ore nodules through soft ground toward the miner.',
    label: 'horizontal',
    powerUpClass: 'charged',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    reachLabel: 'Radius',
    sizeLabel: 'Cells dragged',
    sizeUnit: 'cells',
    node: {
      id: 'tech.terrain.ore_shifter',
      iconId: 'node-terrain-ore-shifter',
      unlockTier: 6,
      prereqs: [],
    },
  },
  {
    itemId: 'consumable.seam_splitter',
    name: 'Seam splitter',
    iconId: 'item-consumable-seam-splitter',
    description: 'A hydraulic wedge that splits rock cleanly along its own grain.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: RACK_CRATE,
    reachLabel: null,
    sizeLabel: 'Fissure',
    sizeUnit: 'cells',
    node: {
      id: 'tech.terrain.seam_splitter',
      iconId: 'node-terrain-seam-splitter',
      unlockTier: 10,
      prereqs: ['tech.terrain.ore_shifter'],
    },
  },
  {
    itemId: 'power.pressure_pocket',
    name: 'Pressure pocket lance',
    iconId: 'item-power-pressure-pocket',
    description: 'A steam lance blows a cavity and packs the spoil into the walls.',
    label: 'horizontal',
    powerUpClass: 'charged',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    reachLabel: null,
    sizeLabel: 'Pocket radius',
    sizeUnit: 'tiles',
    node: {
      id: 'tech.terrain.pressure_pocket',
      iconId: 'node-terrain-pressure-pocket',
      unlockTier: 14,
      prereqs: ['tech.terrain.seam_splitter'],
    },
  },
  {
    itemId: 'consumable.cryo_binder',
    name: 'Cryo binder',
    iconId: 'item-consumable-cryo-binder',
    description: 'A canister of liquefied air that sets running ground hard as slate.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    isIncomeItem: false,
    slots: POWER_UP_SLOTS,
    attach: RACK_CRATE,
    reachLabel: null,
    sizeLabel: 'Fluid cells',
    sizeUnit: 'cells',
    node: {
      id: 'tech.terrain.cryo_binder',
      iconId: 'node-terrain-cryo-binder',
      unlockTier: 17,
      prereqs: ['tech.terrain.stabiliser_foam'],
      requiresDiscovery: 'hazard:frozen',
    },
  },
  {
    itemId: 'consumable.lodestone_beacon',
    name: 'Lodestone beacon',
    iconId: 'item-consumable-lodestone-beacon',
    description: 'A planted lodestone that slowly draws scattered nodules into one vein.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: RACK_CRATE,
    reachLabel: null,
    sizeLabel: 'Gather radius',
    sizeUnit: 'tiles',
    node: {
      id: 'tech.terrain.lodestone_beacon',
      iconId: 'node-terrain-lodestone-beacon',
      unlockTier: 23,
      prereqs: ['tech.terrain.ore_shifter'],
    },
  },
  {
    itemId: 'consumable.shoring_props',
    name: 'Shoring props',
    iconId: 'item-consumable-shoring-props',
    description: 'Screw-jack steel props that hold a cavern roof up while you work.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    isIncomeItem: false,
    slots: POWER_UP_SLOTS,
    attach: RACK_CRATE,
    reachLabel: null,
    sizeLabel: 'Span',
    sizeUnit: 'tiles',
    node: {
      id: 'tech.terrain.shoring_props',
      iconId: 'node-terrain-shoring-props',
      unlockTier: 29,
      prereqs: ['tech.terrain.cryo_binder'],
    },
  },
  {
    itemId: 'power.strata_press',
    name: 'Strata press',
    iconId: 'item-power-strata-press',
    description: 'A ram that packs loose spoil into a ledge across empty cavern air.',
    label: 'horizontal',
    powerUpClass: 'charged',
    isIncomeItem: false,
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    reachLabel: null,
    sizeLabel: 'Ledge',
    sizeUnit: 'cells',
    node: {
      id: 'tech.terrain.strata_press',
      iconId: 'node-terrain-strata-press',
      unlockTier: 35,
      prereqs: ['tech.terrain.shoring_props'],
    },
  },
]

/** The catalogue row of `itemId`, or null for an item of another lane. */
export function terrainItemOf(itemId: string): TerrainItem | null {
  return TERRAIN_ITEMS.find((item) => item.itemId === itemId) ?? null
}

/** The item's `items.balance.<id>` row; every item here has one (the spec says so). */
export function balanceOf(item: TerrainItem): TerrainBalance {
  const balance = TERRAIN_ECONOMY.balance[item.itemId]
  if (balance === undefined) throw new RangeError(`no items.balance row for ${item.itemId}`)
  return balance
}

export function isConsumable(item: TerrainItem): boolean {
  return item.powerUpClass === 'consumable'
}

export function vehicleItemOf(item: TerrainItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: item.slots, attach: item.attach }
}

/**
 * The Mark 1 ladder (#162 4.6, the #165 rotation): cooldown, then size, then charges; a
 * consumable has no cooldown, and its charges are its stack. The size stops at the TD's cap.
 */
export function markLadderOf(item: TerrainItem): MarkLadder {
  const balance = balanceOf(item)
  return {
    isIncomeItem: item.isIncomeItem,
    ...(balance.cooldownTicks !== undefined && { cooldown: balance.cooldownTicks }),
    magnitude: magnitudeOf(balance),
    charges: balance.charges,
  }
}

function magnitudeOf(balance: TerrainBalance): NonNullable<MarkLadder['magnitude']> {
  if (balance.magnitudeLimit === undefined) return { base: balance.magnitude }
  return { base: balance.magnitude, limit: balance.magnitudeLimit }
}

export function techNodeOf(item: TerrainItem): TechNode {
  return {
    id: item.node.id,
    iconId: item.node.iconId,
    lane: 'terrain',
    name: item.name,
    unlockTier: item.node.unlockTier,
    prereqs: item.node.prereqs,
    ...(item.node.requiresDiscovery !== undefined && {
      requiresDiscovery: item.node.requiresDiscovery,
    }),
    unlocks: item.itemId,
    description: item.description,
    label: item.label,
    costKind: 'capability',
    marks: markLadderOf(item),
  }
}

/**
 * The store price (#162 4.1): a charged item is a one-off of 15 band-5 ore at its unlock planet,
 * so the card shows one fixed number; a consumable is a running cost of 2 per unit at the planet
 * it is restocked on.
 */
export function itemPriceOf(item: TerrainItem, planetIndex: number): Money {
  const pricedPlanet = isConsumable(item) ? planetIndex : item.node.unlockTier
  return bandOrePriceAt(priceRowOf(item), pricedPlanet, pricedPlanet)
}

function priceRowOf(item: TerrainItem) {
  return isConsumable(item) ? TERRAIN_ECONOMY.perUnitPrice : TERRAIN_ECONOMY.oneOffPrice
}
