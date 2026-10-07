/**
 * The tech tree's content (spec #161 sections 1 and 5): the `tech-node` kind the lane slices
 * register their authored nodes as, and the `tech-combo-template` kind each lane pair's endless
 * combos are graded from (section 2). The tree slice owns both kinds and is the only reader;
 * Marks and generated combos are computed from them, never registered.
 */
import type { ContentEntry } from '../../../systems/registries/content'
import type { DiscoveryKey } from '../../../systems/registries/discovery'

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'tech-node': TechNode
    'tech-combo-template': TechComboTemplate
  }
}

/** The five swimlanes, in the order the screen draws them and the lane pairs are listed (#161). */
export const TECH_LANES = ['extraction', 'terrain', 'sensing', 'mobility', 'drill-gear'] as const

export type TechLane = (typeof TECH_LANES)[number]

/** A combo sits between two lanes, so it has a row of its own. */
export type TechNodeLane = TechLane | 'combo'

export type ProgressionLabel = 'vertical' | 'horizontal' | 'both'

/** Selects `k_kind` in the node cost (#161 section 3). */
export type TechCostKind = 'capability' | 'slot' | 'combo' | 'mark'

/** What the node is, worked out from the data: an authored capability, a Mark or a combo. */
export type TechNodeKind = 'capability' | 'mark' | 'combo'

/** One key, or any of several (`class:<gateClass>` resolved by the lane that registers it). */
export type DiscoveryRequirement = DiscoveryKey | { anyOf: readonly DiscoveryKey[] }

/**
 * The stats a Mark-bearing item's ladder steps (spec #162 section 4.6), at Mark 1, the item as
 * bought, in whole units: ticks, cells, tiles or a toggle's draw. An item lists only the stats it
 * has: consumables magnitude and stack, toggles draw and magnitude, sensing passives magnitude.
 */
export interface MarkLadder {
  /** An ore-moving item (#161 `incomeItem`): the tighter cooldown floor and magnitude cap. */
  isIncomeItem: boolean
  /** Cooldown ticks, or a toggle's energy draw: shrinks each step down to its floor. */
  cooldown?: number
  /**
   * The size or time the duration step grows, up to its cap; `limit` is the TD's terrain cap in
   * the same unit (32 density cells or 64 swaps per activation, 256 per lodestone beacon).
   */
  magnitude?: { base: number; limit?: number }
  /** Charges per dock, or a consumable's stack: one more each step, up to the cap. */
  charges?: number
  /**
   * The behaviours Marks 3, 6 and 9 bring (the GD lock on #256), on the same ladder and price as
   * any Mark. Absent until the item's lane authors its verbs (`milestonesOf`).
   */
  milestones?: readonly MarkMilestone[]
}

/**
 * The three reusable milestone patterns (#256): holding the slot past the wind-up, a second press
 * within 30 ticks of the first, and the act triggering a sibling in the same lane.
 */
export type MilestonePattern = 'hold' | 'second-tap' | 'sibling-link'

/** One Mark that brings a new behaviour, not only a number step (#256 data shape). */
export interface MarkMilestone {
  mark: number
  pattern: MilestonePattern
  /** What the new behaviour does, in the player's words: the card's milestone line. */
  verb: string
  /** The sibling item a sibling-link fires; only a sibling-link has one. */
  siblingId?: string
}

/** An authored node, as a lane slice registers it (#161 section 5). */
export interface TechNode extends ContentEntry {
  lane: TechNodeLane
  /** Player-facing name. */
  name: string
  /** The earliest planet it can be researched on (the snapped `laneSlotPlanet`). */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryRequirement
  /**
   * What the player must own before it can be researched (#162 acceptance 8, ticket 233): vehicle
   * item ids, or a lining's module id such as `refractory_lining`.
   */
  requiresOwned?: readonly string[]
  /** The store item it unlocks. */
  unlocks: string
  /** The flavour line, no digits: stat and cost lines are generated (#159). */
  description: string
  label: ProgressionLabel
  costKind: Exclude<TechCostKind, 'mark'>
  /** Present on every Mark-bearing item: power-ups, consumables, passives and drill gear. */
  marks?: MarkLadder
}

/**
 * One lane pair's combo (#161 section 2): from planet 41 each generated combo is the next grade of
 * its pair's template, researched at the `research_lab`. The six authored combos are grade 1 of
 * theirs; the other four templates first appear as generated combos.
 */
export interface TechComboTemplate extends ContentEntry {
  lanes: readonly [TechLane, TechLane]
  name: string
  /** The combo store item every grade upgrades. */
  unlocks: string
  /** The two capability nodes it combines, one in each lane. */
  parents: readonly [string, string]
  description: string
}

/** What researching a node gives: the store item, at this Mark or grade. */
export interface ItemUnlock {
  itemId: string
  mark: number
}

/** Any node of the tree, authored or generated, as the rules and the screen read it. */
export interface TreeNode {
  id: string
  kind: TechNodeKind
  lane: TechNodeLane
  name: string
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryRequirement
  requiresOwned?: readonly string[]
  unlocks: ItemUnlock
  iconId: string
  description: string
  label: ProgressionLabel
  costKind: TechCostKind
  /** The exponent of `g` in the node's cost (#161 section 3, Definitions). */
  depthTerm: number
}
