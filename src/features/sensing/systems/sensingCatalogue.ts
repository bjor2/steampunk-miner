/**
 * The sensing lane's store items (spec #162 section 1, the Sensing table; #161 section 1 for the
 * tree nodes): echo sounder, threat periscope, assay lens, hazard barometer, survey flare mortar,
 * signal buoy, galvanic probe and void sounder. The fifth cradle in the same lane is
 * `power-up-core`'s (#200).
 *
 * #203 registers six of them (`sensingContent.ts`); the galvanic probe and the void sounder stay
 * held, unregistered and unseen (GD ruling on #203 Q3).
 */
import type { DiscoveryRequirement } from '../../tech-tree'
import type { ItemAttach } from '../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS, type PowerUpClass } from '../../power-up-core'

/** One store item of the lane, as #162 and #161 write it. */
export interface SensingItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  /** Sentence case: other hardware, not a named extractor (#159 naming ruling). */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  /** Every base item is horizontal (#162 section 1 "Labels"). */
  label: 'horizontal'
  powerUpClass: Extract<PowerUpClass, 'charged' | 'passive' | 'consumable'>
  /** Passives are owned, not slotted (#162 TD lock): no slot, on while owned. */
  slots: readonly LoadoutSlotId[]
  /** A named point for a signature part, else `slot` (TD socket amendments on #162). */
  attach: ItemAttach
  node: SensingNode
}

/** The item's capability node (#161 section 1). */
export interface SensingNode {
  id: string
  iconId: string
  /** The unlock planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  /** Researchable at `unlockTier` once met, else one planet later (#161 `discoveryGrace`). */
  requiresDiscovery: DiscoveryRequirement | null
}

const NO_SLOT: readonly LoadoutSlotId[] = []

export const SENSING_ITEMS: readonly SensingItem[] = [
  {
    itemId: 'power.echo_sounder',
    name: 'Echo sounder',
    iconId: 'item-power-echo-sounder',
    description: 'A steam hammer knocks the hull and a brass horn listens for the echo.',
    label: 'horizontal',
    powerUpClass: 'charged',
    slots: POWER_UP_SLOTS,
    attach: 'hull.roof.aft',
    node: {
      id: 'tech.sensing.echo_sounder',
      iconId: 'node-sensing-echo-sounder',
      unlockTier: 2,
      prereqs: [],
      requiresDiscovery: null,
    },
  },
  {
    itemId: 'passive.threat_periscope',
    name: 'Threat periscope',
    iconId: 'item-passive-threat-periscope',
    description: 'A periscope whose galvanometer twitches toward anything moving in the rock.',
    label: 'horizontal',
    powerUpClass: 'passive',
    slots: NO_SLOT,
    attach: 'hull.roof.fore',
    node: {
      id: 'tech.sensing.threat_periscope',
      iconId: 'node-sensing-threat-periscope',
      unlockTier: 5,
      prereqs: ['tech.sensing.echo_sounder'],
      requiresDiscovery: 'enemy:tunnel_wrecker',
    },
  },
  {
    itemId: 'passive.assay_lens',
    name: 'Assay lens',
    iconId: 'item-passive-assay-lens',
    description: "A turning prism of tinted glass splits an ore's glint into assay colours.",
    label: 'horizontal',
    powerUpClass: 'passive',
    slots: NO_SLOT,
    attach: 'cab.gauge',
    node: {
      id: 'tech.sensing.assay_lens',
      iconId: 'node-sensing-assay-lens',
      unlockTier: 7,
      prereqs: ['tech.sensing.echo_sounder'],
      requiresDiscovery: null,
    },
  },
  {
    itemId: 'passive.hazard_barometer',
    name: 'Hazard barometer',
    iconId: 'item-passive-hazard-barometer',
    description: 'A sealed aneroid capsule flexes as the bit nears trapped heat or pressure.',
    label: 'horizontal',
    powerUpClass: 'passive',
    slots: NO_SLOT,
    attach: 'cab.gauge',
    node: {
      id: 'tech.sensing.hazard_barometer',
      iconId: 'node-sensing-hazard-barometer',
      unlockTier: 7,
      prereqs: ['tech.sensing.assay_lens'],
      requiresDiscovery: 'hazard:heat_lava',
    },
  },
  {
    itemId: 'consumable.flare_mortar',
    name: 'Survey flare mortar',
    iconId: 'item-consumable-flare-mortar',
    description: 'A mortar lobs a magnesium flare that burns and lights the rock it strikes.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    slots: POWER_UP_SLOTS,
    // On top of the charge rack, beside its shells (G&V attach pick on #162).
    attach: 'hull.rear',
    node: {
      id: 'tech.sensing.flare_mortar',
      iconId: 'node-sensing-flare-mortar',
      unlockTier: 13,
      prereqs: ['tech.sensing.echo_sounder'],
      requiresDiscovery: null,
    },
  },
  {
    itemId: 'consumable.signal_buoy',
    name: 'Signal buoy',
    iconId: 'item-consumable-signal-buoy',
    description: 'A clockwork buoy that ticks out its place to every miner nearby.',
    label: 'horizontal',
    powerUpClass: 'consumable',
    slots: POWER_UP_SLOTS,
    // A crate on the rack (#162 section 1).
    attach: 'hull.rear',
    node: {
      id: 'tech.sensing.signal_buoy',
      iconId: 'node-sensing-signal-buoy',
      unlockTier: 21,
      prereqs: ['tech.sensing.flare_mortar'],
      requiresDiscovery: null,
    },
  },
  {
    itemId: 'power.galvanic_probe',
    name: 'Galvanic probe',
    iconId: 'item-power-galvanic-probe',
    description: "Twin copper probes read the rock's current on a trembling needle.",
    label: 'horizontal',
    powerUpClass: 'charged',
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    node: {
      id: 'tech.sensing.galvanic_probe',
      iconId: 'node-sensing-galvanic-probe',
      // P25 in #162, moved to P26 by the Horizontal Scaler's snap (#161 decisions).
      unlockTier: 26,
      prereqs: ['tech.sensing.hazard_barometer'],
      requiresDiscovery: 'hazard:magnetic',
    },
  },
  {
    itemId: 'power.void_sounder',
    name: 'Void sounder',
    iconId: 'item-power-void-sounder',
    description: 'A long-throw horn that times its echo across a hollow cavern.',
    label: 'horizontal',
    powerUpClass: 'charged',
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    node: {
      id: 'tech.sensing.void_sounder',
      iconId: 'node-sensing-void-sounder',
      unlockTier: 33,
      prereqs: ['tech.sensing.galvanic_probe'],
      requiresDiscovery: 'hazard:hollow',
    },
  },
]

/** The catalogue row of `itemId`, or null for an item of another lane. */
export function sensingItemOf(itemId: string): SensingItem | null {
  return SENSING_ITEMS.find((item) => item.itemId === itemId) ?? null
}
