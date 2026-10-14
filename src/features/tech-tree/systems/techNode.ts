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

/**
 * The six swimlanes, in the order the screen draws them and the lane pairs are listed (#161); the
 * sixth, Aetheric science, is the GD lock on #245.
 */
export const TECH_LANES = [
  'extraction',
  'terrain',
  'sensing',
  'mobility',
  'drill-gear',
  'aetheric',
] as const

export type TechLane = (typeof TECH_LANES)[number]

/**
 * The Armoury group's lanes (GD decision on #310, ticket 318): one per weapon with a stats.json
 * row, namespaced so a lane id never collides with a feature id (#200). They join no lane pair:
 * the armoury enters the combo rotation only through its own weapon x lane templates.
 */
export const ARMOURY_LANES = ['armoury.bore_gun', 'armoury.auto_guns'] as const

export type ArmouryLane = (typeof ARMOURY_LANES)[number]

/** A combo sits between two lanes, so it has a row of its own. */
export type TechNodeLane = TechLane | ArmouryLane | 'combo'

/**
 * A lane a combo template takes a parent from: one of the six, or a weapon's own lane in a
 * weapon x lane template (GD decision on #310, ticket 320).
 */
export type ComboLane = TechLane | ArmouryLane

const ARMOURY_LANE_PREFIX = 'armoury.'

export function isArmouryLane(lane: TechNodeLane): lane is ArmouryLane {
  return lane.startsWith(ARMOURY_LANE_PREFIX)
}

/** The lane's `laneBias` key: the weapon for an armoury lane (`bore_gun`), else the lane itself. */
export function laneBiasKeyOf(lane: TechNodeLane): string {
  return isArmouryLane(lane) ? lane.slice(ARMOURY_LANE_PREFIX.length) : lane
}

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
  /**
   * A bespoke ladder the item's own slice steps (the long barrel's range then hold, #310): its
   * Marks run to here and the rotation steps nothing, so the stats above stay as bought.
   */
  lastMark?: number
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
  /**
   * The price anchor (the snapped `laneSlotPlanet`): the planet whose band ore prices it, so it
   * arrives around there. Never a lock: research waits only on money, prerequisites and what it
   * `requiresOwned` (Bjor's ruling on #411).
   */
  unlockTier: number
  prereqs: readonly string[]
  /** The discovery its lane keys it to (#161 light D); research never waits on it (#411). */
  requiresDiscovery?: DiscoveryRequirement
  /**
   * What the player must own before it can be researched (#162 acceptance 8, ticket 233): vehicle
   * item ids, or a lining's module id such as `refractory_lining`.
   */
  requiresOwned?: readonly string[]
  /**
   * The locked-schedule rows it hangs on (#318, ticket 358): while one ships nothing (a vision
   * row) the node is a held item, hidden from the screen and refused; a row's planet is only its
   * price anchor, never a lock (#411, `isFeatureForSale`).
   */
  requiresFeature?: readonly string[]
  /**
   * Researched at the `research_lab`, as every combo is: the Aetheric lane's entry node (GD lock
   * on #245). The lab's planet is no lock either (#411).
   */
  researchedAt?: 'research_lab'
  /** The store item it unlocks. */
  unlocks: string
  /** The flavour line, no digits: stat and cost lines are generated (#159). */
  description: string
  /**
   * Lines the card shows after "Note:", no digits: what the flavour cannot say, such as gear that
   * does not stack with this one (Content on #392).
   */
  cardNotes?: readonly string[]
  label: ProgressionLabel
  costKind: Exclude<TechCostKind, 'mark'>
  /** Present on every Mark-bearing item: power-ups, consumables, passives and drill gear. */
  marks?: MarkLadder
  /**
   * The spend-guard family its research, its item and its Marks are filed under (#212's one
   * `armoury` row, GD decision on #310); absent for a node no family row reads.
   */
  familyId?: string
}

/**
 * One lane pair's combo (#161 section 2): from planet 41 each generated combo is the next grade of
 * its pair's template, researched at the `research_lab`. The six authored combos are grade 1 of
 * theirs; the other four templates first appear as generated combos. A weapon x lane template
 * (one armoury lane, ticket 320) takes its own turn in the rotation, never a lane pair's.
 */
export interface TechComboTemplate extends ContentEntry {
  lanes: readonly [ComboLane, ComboLane]
  name: string
  /** The combo store item every grade upgrades. */
  unlocks: string
  /** The two capability nodes it combines, one in each lane. */
  parents: readonly [string, string]
  description: string
  /**
   * What the player must own before any grade can be researched, as `TechNode.requiresOwned`:
   * a combo's two parent items (GD lock on #206, decision 7).
   */
  requiresOwned?: readonly string[]
  /**
   * The schedule rows every grade stays hidden and refused behind, as `TechNode.requiresFeature`:
   * a weapon x lane template's `research_lab` and its weapon's row (GD decision on #310).
   */
  requiresFeature?: readonly string[]
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
  /** The price anchor (`TechNode.unlockTier`), never a lock. */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryRequirement
  requiresOwned?: readonly string[]
  requiresFeature?: readonly string[]
  researchedAt?: 'research_lab'
  unlocks: ItemUnlock
  familyId?: string
  iconId: string
  description: string
  cardNotes?: readonly string[]
  label: ProgressionLabel
  costKind: TechCostKind
  /** The exponent of `g` in the node's cost (#161 section 3, Definitions). */
  depthTerm: number
}
