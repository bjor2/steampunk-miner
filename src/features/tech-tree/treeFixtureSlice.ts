/**
 * A stand-in for the lane slices in specs: registers the #161 authored tree and the ten combo
 * templates the way the lanes will, through `content`. Its id is `tech`, so the registrar takes
 * the spec's `tech.<lane>.<name>` ids. Only specs use it, through `withRegistrations`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromSafeInteger } from '../../systems/money'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import { forkPairOf, type ForkBranchSpec, type ForkPair } from './systems/forkNode'
import type { MarkLadder, TechLane } from './systems/techNode'
import { AUTHORED_TREE_FIXTURE, COMBO_TEMPLATES_FIXTURE } from './systems/treeFixtures'

export const TREE_FIXTURE_SLICE: SliceDefinition = {
  id: 'tech',
  register(r) {
    r.content('tech-node', AUTHORED_TREE_FIXTURE)
    r.content('tech-combo-template', COMBO_TEMPLATES_FIXTURE)
  },
}

/** The one node `ANCHORED_NODE_SLICE` registers, held while `frozen_planets` is a vision row. */
export const ANCHORED_NODE_ID = 'anchor-probe.frost_sight'

/**
 * A lane node anchored on a schedule row (`requiresFeature`, ticket 358): `frozen_planets` ships
 * nothing yet, so the node is a held item, never shown and refused on any planet (#411). Only
 * specs use it.
 */
export const ANCHORED_NODE_SLICE: SliceDefinition = {
  id: 'anchor-probe',
  register(r) {
    r.content('tech-node', [
      {
        id: ANCHORED_NODE_ID,
        iconId: 'icon-panel-slots',
        lane: 'sensing',
        name: 'Frost sight',
        unlockTier: 2,
        prereqs: [],
        requiresFeature: ['frozen_planets'],
        unlocks: 'passive.frost_sight',
        description: 'Reads the rime behind the rock.',
        label: 'horizontal',
        costKind: 'capability',
      },
    ])
  },
}

/**
 * The research lab's building, standing from its schedule row's planet (P15) as the dock buildings
 * slice stamps it: combos and the Aetheric entry node are held while no building stands for the
 * lab (#411). Only specs use it.
 */
export const LAB_FIXTURE_SLICE: SliceDefinition = {
  id: 'lab-fixture',
  register: (r) => r.dockFacility({ id: 'lab-fixture.lab', scheduleRowId: 'research_lab' }),
}

/** What the shop fixture asks for every item it sells. */
export const FIXTURE_ITEM_PRICE = fromSafeInteger(1000)

/**
 * The store's side of the fixture (ticket 248), as the lane slices sell their rows: every item the
 * fixture tree unlocks is a `vehicle-item`, and each one-off sells at a flat price; a consumable is
 * left to the restock and a combo is no vehicle item.
 */
export const TREE_SHOP_FIXTURE_SLICE: SliceDefinition = {
  id: 'tree-shop',
  register(r) {
    r.content('vehicle-item', FIXTURE_ITEM_IDS.map(fixtureItemOf))
    r.vehicleItemSeller({
      id: 'tree-shop.seller',
      offerOf: (itemId) =>
        isConsumable(itemId) ? null : { name: itemId, price: FIXTURE_ITEM_PRICE },
    })
  },
}

const FIXTURE_ITEM_IDS: readonly string[] = AUTHORED_TREE_FIXTURE.filter(
  (node) => node.lane !== 'combo',
).map((node) => node.unlocks)

function fixtureItemOf(itemId: string): VehicleItem {
  return { id: itemId, iconId: 'icon-panel-slots', slots: ['powerup.1'], attach: null }
}

function isConsumable(itemId: string): boolean {
  return itemId.startsWith('consumable.')
}

/**
 * Two ladders of different lengths, so a re-choice carries Marks onto a shorter ladder and a
 * Mark step is priced alike on both.
 */
export const LONG_FORK_LADDER: MarkLadder = {
  isIncomeItem: false,
  cooldown: 300,
  magnitude: { base: 600 },
}
export const SHORT_FORK_LADDER: MarkLadder = { isIncomeItem: true, cooldown: 600, charges: 2 }

/** The #255 lock's six pairs, the first branch on the long ladder and the second on the short. */
const FORK_BRANCH_NAMES: Readonly<Record<TechLane, readonly [string, string]>> = {
  extraction: ['hauler', 'prospector'],
  terrain: ['bracer', 'breaker'],
  sensing: ['scout', 'diviner'],
  mobility: ['agile', 'armoured'],
  'drill-gear': ['wide', 'deep'],
  aetheric: ['phase', 'arc'],
}

export const FORK_PAIRS_FIXTURE: readonly ForkPair[] = Object.entries(FORK_BRANCH_NAMES).map(
  ([lane, [first, second]]) =>
    forkPairOf(lane as TechLane, [
      forkBranchSpecOf(first, LONG_FORK_LADDER),
      forkBranchSpecOf(second, SHORT_FORK_LADDER),
    ]),
)

/** The fork item a fixture branch unlocks. */
export function forkItemIdOf(branch: string): string {
  return `power.fork_${branch}`
}

/** A stand-in for the lane slices' fork builds: a pair in every lane, no prerequisite. */
export const FORK_FIXTURE_SLICE: SliceDefinition = {
  id: 'fork-probe',
  register(r) {
    r.content(
      'tech-node',
      FORK_PAIRS_FIXTURE.flatMap((pair) => pair.branches),
    )
  },
}

function forkBranchSpecOf(branch: string, marks: MarkLadder): ForkBranchSpec {
  return {
    branch,
    name: `Stand-in ${branch}`,
    iconId: 'icon-panel-slots',
    prereqs: [],
    unlocks: forkItemIdOf(branch),
    description: `A stand-in for the ${branch} branch.`,
    label: 'horizontal',
    marks,
  }
}
