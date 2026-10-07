/**
 * The drill-gear lane's store items (spec #162 section 1, the drill gear table; #161 section 1 for
 * the tree nodes): the eight heads, collar and flank parts, as catalogue rows, and the
 * `vehicle-item` rows, tech nodes and prices made from them. Node ids are `tech.drill_gear.*`
 * (#205 GD lock: the #224 bare-id rule refuses the hyphen of `tech.drill-gear.*`).
 *
 * #205 registers six of them with their effects (`drillGearContent.ts`). The twin-bit head and the
 * dielectric bit are held back (GD lock on #205 Q3 a): unregistered, unseen and unpriced until the
 * mechanic the twin bit removes exists, and the dielectric bit's prereq is the twin bit.
 */
import type { Money } from '../../../systems/money'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { AttachId } from '../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId, VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUpClass } from '../../power-up-core'
import type { MarkLadder, MarkStatName, ProgressionLabel, TechNode } from '../../tech-tree'
import {
  DRILL_GEAR_ECONOMY,
  type DrillGearBalance,
  type DrillGearStatName,
} from './drillGearEconomy'

export type DrillGearStatUnit =
  'charges' | 'ticks' | 'tiles' | 'cells' | 'm' | 'bp' | 'bp_per_second'

/** One stat line the item's card prints, and the Mark rotation step that grows it, if any. */
export interface DrillGearStat {
  stat: DrillGearStatName
  label: string
  unit: DrillGearStatUnit
  /** Cooldown also carries a toggle's energy draw (#162 4.6: "toggles: energy draw x0.92"). */
  markRole?: MarkStatName
}

/** One store item of the lane, as #162 and #161 write it. */
export interface DrillGearItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  /** Sentence case: hardware, not a named extractor (#159 naming ruling). */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  label: ProgressionLabel
  powerUpClass: Extract<PowerUpClass, 'passive' | 'charged'>
  /** Flipped in the field (#162 2.1); equipping is still platform only. */
  isToggle: boolean
  /** Never registered, so no store, tree, card or bot sees it (#205 GD lock, Q3 a). */
  isHeldBack: boolean
  /** Its drill socket; the part draws at the attach point of the same name (#162 TD lock). */
  slot: Extract<LoadoutSlotId, 'drill.head' | 'drill.flank' | 'drill.collar'>
  attach: AttachId
  stats: readonly DrillGearStat[]
  node: DrillGearNode
}

/** The item's capability node (#161 section 1). */
export interface DrillGearNode {
  id: string
  iconId: string
  /** The unlock planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryKey
  /** The Schedule C row the node absorbs (#161: `side_drills` is the side cutters). */
  scheduleRowId?: string
}

const CHARGES: DrillGearStat = {
  stat: 'charges',
  label: 'Charges',
  unit: 'charges',
  markRole: 'charges',
}
const COOLDOWN: DrillGearStat = {
  stat: 'cooldownTicks',
  label: 'Cooldown',
  unit: 'ticks',
  markRole: 'cooldown',
}
const WIND_UP: DrillGearStat = { stat: 'windUpTicks', label: 'Wind-up', unit: 'ticks' }
const STEPPED_DRAW: DrillGearStat = {
  stat: 'drawBpPerSecond',
  label: 'Energy draw',
  unit: 'bp_per_second',
  markRole: 'cooldown',
}
const DRAW: DrillGearStat = { stat: 'drawBpPerSecond', label: 'Energy draw', unit: 'bp_per_second' }

export const DRILL_GEAR_ITEMS: readonly DrillGearItem[] = [
  {
    itemId: 'gear.vibratory_bit',
    name: 'Vibratory bit',
    iconId: 'item-gear-vibratory-bit',
    description: 'A cam-driven hammer shakes the bit until soft ground crumbles ahead.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: false,
    isHeldBack: false,
    slot: 'drill.head',
    attach: 'drill.head',
    // The TD's terrain-cap note on #162 names the vibratory bit's reach as its Mark magnitude.
    stats: [
      { stat: 'crumbleAheadCells', label: 'Crumbles ahead', unit: 'cells', markRole: 'magnitude' },
      { stat: 'crumbleHardnessBp', label: 'Crumbles up to drill power', unit: 'bp' },
    ],
    node: {
      id: 'tech.drill_gear.vibratory_bit',
      iconId: 'node-drill-gear-vibratory-bit',
      unlockTier: 4,
      prereqs: [],
    },
  },
  {
    itemId: 'gear.spoil_auger',
    name: 'Spoil auger',
    iconId: 'item-gear-spoil-auger',
    description: 'A fluted auger throws spoil back to plug the tunnel behind you.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: true,
    isHeldBack: false,
    slot: 'drill.collar',
    attach: 'drill.collar',
    stats: [
      STEPPED_DRAW,
      { stat: 'fillBehindM', label: 'Fills behind', unit: 'm' },
      { stat: 'vehicleClearanceM', label: 'Clear of vehicles', unit: 'm' },
    ],
    node: {
      id: 'tech.drill_gear.spoil_auger',
      iconId: 'node-drill-gear-spoil-auger',
      unlockTier: 8,
      prereqs: ['tech.drill_gear.vibratory_bit'],
    },
  },
  {
    itemId: 'gear.side_cutters',
    name: 'Side cutters',
    iconId: 'item-gear-side-cutters',
    description: 'Geared flank cutters ride beside the bit and widen the bore.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: true,
    isHeldBack: false,
    slot: 'drill.flank',
    attach: 'drill.flank',
    // The energy share never steps: the Vertical Scaler holds it at or above the main drill's.
    stats: [
      { stat: 'sideCells', label: 'Side cells', unit: 'cells', markRole: 'magnitude' },
      { stat: 'sideEnergyShareBp', label: 'Energy per side cell', unit: 'bp' },
    ],
    node: {
      id: 'tech.drill_gear.side_cutters',
      iconId: 'node-drill-gear-side-cutters',
      unlockTier: 13,
      prereqs: ['tech.drill_gear.vibratory_bit'],
      scheduleRowId: 'side_drills',
    },
  },
  {
    itemId: 'gear.thaw_crown',
    name: 'Thaw crown',
    iconId: 'item-gear-thaw-crown',
    description: 'Steam-heated teeth that slice frozen ground like warm wax.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: false,
    isHeldBack: false,
    slot: 'drill.head',
    attach: 'drill.head',
    // No numbers until the frozen-planet spec gives the frost penalty it removes.
    stats: [],
    node: {
      id: 'tech.drill_gear.thaw_crown',
      iconId: 'node-drill-gear-thaw-crown',
      unlockTier: 17,
      prereqs: ['tech.drill_gear.vibratory_bit'],
      requiresDiscovery: 'hazard:frozen',
    },
  },
  {
    itemId: 'gear.twin_bit',
    name: 'Twin-bit head',
    iconId: 'item-gear-twin-bit',
    description: 'Two counter-rotating bits cancel their torque, steady at any angle.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: false,
    isHeldBack: true,
    slot: 'drill.head',
    attach: 'drill.head',
    stats: [],
    node: {
      id: 'tech.drill_gear.twin_bit',
      iconId: 'node-drill-gear-twin-bit',
      unlockTier: 19,
      prereqs: ['tech.drill_gear.vibratory_bit'],
    },
  },
  {
    itemId: 'gear.sampling_corer',
    name: 'Sampling corer',
    iconId: 'item-gear-sampling-corer',
    description: 'A hollow tube punches ahead and draws back a plug of what lies beyond.',
    label: 'horizontal',
    powerUpClass: 'charged',
    isToggle: false,
    isHeldBack: false,
    slot: 'drill.collar',
    attach: 'drill.collar',
    stats: [
      CHARGES,
      COOLDOWN,
      WIND_UP,
      { stat: 'reachTiles', label: 'Reach', unit: 'tiles', markRole: 'magnitude' },
    ],
    node: {
      id: 'tech.drill_gear.sampling_corer',
      iconId: 'node-drill-gear-sampling-corer',
      unlockTier: 24,
      prereqs: ['tech.drill_gear.spoil_auger'],
    },
  },
  {
    itemId: 'gear.dielectric_bit',
    name: 'Dielectric bit',
    iconId: 'item-gear-dielectric-bit',
    description: 'A ceramic-sheathed bit that bores live rock without passing a spark.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: false,
    isHeldBack: true,
    slot: 'drill.head',
    attach: 'drill.head',
    // No numbers until the magnetic-planet spec gives the shock it removes.
    stats: [],
    node: {
      id: 'tech.drill_gear.dielectric_bit',
      iconId: 'node-drill-gear-dielectric-bit',
      unlockTier: 27,
      prereqs: ['tech.drill_gear.twin_bit'],
      requiresDiscovery: 'hazard:magnetic',
    },
  },
  {
    itemId: 'gear.reach_boom',
    name: 'Reach boom',
    iconId: 'item-gear-reach-boom',
    description: 'A telescoping boom that pushes the bit ahead of the miner.',
    label: 'horizontal',
    powerUpClass: 'passive',
    isToggle: true,
    isHeldBack: false,
    slot: 'drill.collar',
    attach: 'drill.collar',
    // Neither stat steps: the draw is nil (#162 4.4) and the reach is clamped (#205 GD lock).
    stats: [{ stat: 'aheadCells', label: 'Reach ahead', unit: 'cells' }, DRAW],
    node: {
      id: 'tech.drill_gear.reach_boom',
      iconId: 'node-drill-gear-reach-boom',
      unlockTier: 34,
      prereqs: ['tech.drill_gear.sampling_corer'],
    },
  },
]

/** The items #205 registers: every row but the held-back ones. */
export const SHIPPED_DRILL_GEAR: readonly DrillGearItem[] = DRILL_GEAR_ITEMS.filter(
  (item) => !item.isHeldBack,
)

/** The catalogue row of `itemId`, or null for an item of another lane. */
export function drillGearItemOf(itemId: string): DrillGearItem | null {
  return DRILL_GEAR_ITEMS.find((item) => item.itemId === itemId) ?? null
}

/** The item's `items.balance.<id>` row; every item here has one (the file says so). */
export function balanceOf(item: DrillGearItem): DrillGearBalance {
  const balance = DRILL_GEAR_ECONOMY.balance[item.itemId]
  if (balance === undefined) throw new RangeError(`no items.balance row for ${item.itemId}`)
  return balance
}

/** The Mark 1 value of one of the item's stats; a stat the row lacks is a broken file. */
export function baseValueOf(item: DrillGearItem, stat: DrillGearStatName): number {
  const value = balanceOf(item)[stat]
  if (value === undefined) throw new RangeError(`items.balance.${item.itemId} has no ${stat}`)
  return value
}

/**
 * The Mark 1 value of one stat of a lane item, by id: what the effect uses while Marks are not in
 * play (`power_up_used.mark` is 0 until they land, #200). An id this lane lacks is a broken caller.
 */
export function gearValueOf(itemId: string, stat: DrillGearStatName): number {
  const item = drillGearItemOf(itemId)
  if (item === null) throw new RangeError(`${itemId} is no drill-gear item`)
  return baseValueOf(item, stat)
}

export function vehicleItemOf(item: DrillGearItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: [item.slot], attach: item.attach }
}

/**
 * The Mark 1 ladder from the stats that carry a Mark role (#162 4.6, the #165 rotation): cooldown
 * or a toggle's draw, then the magnitude, then charges. No drill gear moves ore.
 */
export function markLadderOf(item: DrillGearItem): MarkLadder {
  const cooldown = steppedValueOf(item, 'cooldown')
  const magnitude = steppedValueOf(item, 'magnitude')
  const charges = steppedValueOf(item, 'charges')
  return {
    isIncomeItem: false,
    ...(cooldown !== null && { cooldown }),
    ...(magnitude !== null && { magnitude: { base: magnitude } }),
    ...(charges !== null && { charges }),
  }
}

/** The Mark 1 value of the stat that `role` steps, or null when the item has none. */
export function steppedValueOf(item: DrillGearItem, role: MarkStatName): number | null {
  const stat = item.stats.find((candidate) => candidate.markRole === role)
  return stat === undefined ? null : baseValueOf(item, stat.stat)
}

export function techNodeOf(item: DrillGearItem): TechNode {
  return {
    id: item.node.id,
    iconId: item.node.iconId,
    lane: 'drill-gear',
    name: item.name,
    unlockTier: item.node.unlockTier,
    prereqs: item.node.prereqs,
    ...(item.node.requiresDiscovery !== undefined && {
      requiresDiscovery: item.node.requiresDiscovery,
    }),
    ...(item.node.scheduleRowId !== undefined && { scheduleRowId: item.node.scheduleRowId }),
    unlocks: item.itemId,
    description: item.description,
    label: item.label,
    costKind: 'capability',
    marks: markLadderOf(item),
  }
}

/**
 * The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, with its `paceScale`,
 * so the card shows one fixed number on every planet. Null for a held-back item: it has no price
 * because it cannot be bought.
 */
export function itemPriceOf(item: DrillGearItem): Money | null {
  if (item.isHeldBack) return null
  const unlockPlanet = item.node.unlockTier
  return bandOrePriceAt(DRILL_GEAR_ECONOMY.price, unlockPlanet, unlockPlanet)
}
