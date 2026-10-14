/**
 * A stand-in for the lane slices in specs: registers the #161 authored tree and the ten combo
 * templates the way the lanes will, through `content`. Its id is `tech`, so the registrar takes
 * the spec's `tech.<lane>.<name>` ids. Only specs use it, through `withRegistrations`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromSafeInteger } from '../../systems/money'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import { AUTHORED_TREE_FIXTURE, COMBO_TEMPLATES_FIXTURE } from './systems/treeFixtures'

export const TREE_FIXTURE_SLICE: SliceDefinition = {
  id: 'tech',
  register(r) {
    r.content('tech-node', AUTHORED_TREE_FIXTURE)
    r.content('tech-combo-template', COMBO_TEMPLATES_FIXTURE)
  },
}

/** The one node `ANCHORED_NODE_SLICE` registers, hidden until `heat_lava` opens on P8. */
export const ANCHORED_NODE_ID = 'anchor-probe.lava_sight'

/**
 * A lane node anchored on a schedule row (`requiresFeature`, ticket 358), reachable by tier from
 * P2 but shown and researchable only once the row's `FeatureUnlocked` came. Only specs use it.
 */
export const ANCHORED_NODE_SLICE: SliceDefinition = {
  id: 'anchor-probe',
  register(r) {
    r.content('tech-node', [
      {
        id: ANCHORED_NODE_ID,
        iconId: 'icon-panel-slots',
        lane: 'sensing',
        name: 'Lava sight',
        unlockTier: 2,
        prereqs: [],
        requiresFeature: ['heat_lava'],
        unlocks: 'passive.lava_sight',
        description: 'Reads the glow behind the rock.',
        label: 'horizontal',
        costKind: 'capability',
      },
    ])
  },
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
