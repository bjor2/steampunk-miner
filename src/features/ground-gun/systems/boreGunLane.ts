/**
 * The `armoury.bore_gun` lane (Content's node table on #310 as the GD locked it, ticket 318): the
 * bore gun's eight modules as store items, each with its capability node, anchored on the
 * `bore_gun` row so the lane stays hidden until that row's `FeatureUnlocked`. Every node, item and
 * Mark is filed under the `armoury` spend-guard family. Gun modules take the income absorb limits;
 * the long barrel's Marks are its own range-then-hold ladder (`boreLadders.ts`), not the rotation.
 *
 * The gimbal sight, the steam sear and the long barrel act through seams the slice already has
 * (the fire input, the provider's auto-shoot answer and its range and hold). The five signature
 * modules (ticket 380, the GD ruling on #318) shape the shot itself through the provider's
 * `shotShapeOf` (#377): the splay choke and the rifled bore on every shot, the cementing round,
 * the earthing spike and the strut bore while their per-dock charges and cooldowns allow
 * (`signatureShapes.ts`, `moduleUse.ts`). The earthing spike also waits on `grounded_lining`
 * (P25), so nothing magnetic or electrified previews before that row (HS on #318).
 *
 * The flavour lines are Content's, except the sight's "nearest" glint, which the GD's value rule
 * replaced ("richest").
 */
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { MarkLadder, ProgressionLabel, TechNode } from '../../tech-tree'
import { moduleLadderOf } from './armouryModules'
import { ARMOURY_FAMILY, BORE_GUN_SCHEDULE_ROW } from './boreGunContent'
import { longBarrelMasteredMark } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

export const BORE_GUN_LANE = 'armoury.bore_gun'

export const GIMBAL_SIGHT_ITEM_ID = 'weapon.gimbal_sight'
export const LONG_BARREL_ITEM_ID = 'weapon.long_barrel'
export const SPLAY_CHOKE_ITEM_ID = 'weapon.splay_choke'
export const CEMENTING_ROUND_ITEM_ID = 'weapon.cementing_round'
export const EARTHING_SPIKE_ITEM_ID = 'weapon.earthing_spike'
export const RIFLED_BORE_ITEM_ID = 'weapon.rifled_bore'
export const STRUT_BORE_ITEM_ID = 'weapon.strut_bore'

/** The row the grounded lining opens on (P25): the earthing spike stays hidden until it. */
const GROUNDED_LINING_ROW = 'grounded_lining'

/** Where the module sits on the gun (the #315 mount's zones; the art wiring is #321's). */
export type BoreMountZone = 'sight' | 'breech' | 'barrel' | 'muzzle' | 'magazine'

/** One module of the lane as Content's table writes it. */
export interface BoreGunModule {
  itemId: string
  name: string
  iconId: string
  /** The flavour line: no digits, never "rig" (#159). */
  description: string
  label: ProgressionLabel
  mount: BoreMountZone
  /** Never registered until a kernel seam reaches its effect. */
  isHeldBack: boolean
  node: BoreGunNode
}

export interface BoreGunNode {
  id: string
  iconId: string
  /** The placed planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  /** Rows besides the lane's own anchor (`casing_cement`, `grounded_lining`). */
  alsoRequiresFeature?: readonly string[]
  requiresDiscovery?: DiscoveryKey
}

export const BORE_GUN_MODULES: readonly BoreGunModule[] = [
  {
    itemId: GIMBAL_SIGHT_ITEM_ID,
    name: 'Gimbal sight',
    iconId: 'item-weapon-gimbal-sight',
    description: 'A brass gimbal swings the sight onto the richest glint of ore and holds it.',
    label: 'horizontal',
    mount: 'sight',
    isHeldBack: false,
    node: nodeOf('gimbal_sight', 2, []),
  },
  {
    itemId: STEAM_SEAR_ITEM_ID,
    name: 'Steam sear',
    iconId: 'item-weapon-steam-sear',
    description: 'Steam leans on a steel sear and slips the catch once the sight holds its ore.',
    label: 'horizontal',
    mount: 'breech',
    isHeldBack: false,
    node: nodeOf('steam_sear', 6, ['gimbal_sight']),
  },
  {
    itemId: LONG_BARREL_ITEM_ID,
    name: 'Long barrel',
    iconId: 'item-weapon-long-barrel',
    description: 'A longer iron barrel throws the bore a cell further for every forged length.',
    label: 'both',
    mount: 'barrel',
    isHeldBack: false,
    node: nodeOf('long_barrel', 12, ['gimbal_sight']),
  },
  {
    itemId: SPLAY_CHOKE_ITEM_ID,
    name: 'Splay choke',
    iconId: 'item-weapon-splay-choke',
    description: 'A slotted brass choke splays one charge into twin lines that share its bite.',
    label: 'horizontal',
    mount: 'muzzle',
    isHeldBack: false,
    node: nodeOf('splay_choke', 18, ['long_barrel']),
  },
  {
    itemId: CEMENTING_ROUND_ITEM_ID,
    name: 'Cementing round',
    iconId: 'item-weapon-cementing-round',
    description: 'A cored round weeps casing cement into every wall the bore opens behind it.',
    label: 'horizontal',
    mount: 'magazine',
    isHeldBack: false,
    node: {
      ...nodeOf('cementing_round', 23, ['long_barrel']),
      alsoRequiresFeature: ['casing_cement'],
    },
  },
  {
    itemId: EARTHING_SPIKE_ITEM_ID,
    name: 'Earthing spike',
    iconId: 'item-weapon-earthing-spike',
    description: 'A copper spike rides the bore and bleeds the charged rock quiet along its line.',
    label: 'horizontal',
    mount: 'muzzle',
    isHeldBack: false,
    node: {
      ...nodeOf('earthing_spike', 28, ['long_barrel']),
      alsoRequiresFeature: [GROUNDED_LINING_ROW],
      requiresDiscovery: 'hazard:magnetic',
    },
  },
  {
    itemId: RIFLED_BORE_ITEM_ID,
    name: 'Rifled bore',
    iconId: 'item-weapon-rifled-bore',
    description: 'Rifling in the steel bore lets the charge lean and follow a seam as it runs.',
    label: 'horizontal',
    mount: 'barrel',
    isHeldBack: false,
    node: nodeOf('rifled_bore', 33, ['long_barrel']),
  },
  {
    itemId: STRUT_BORE_ITEM_ID,
    name: 'Strut bore',
    iconId: 'item-weapon-strut-bore',
    description: 'The bore stops at the mouth of a hollow and wedges an iron strut across it.',
    label: 'horizontal',
    mount: 'magazine',
    isHeldBack: false,
    node: { ...nodeOf('strut_bore', 37, ['cementing_round']), requiresDiscovery: 'hazard:hollow' },
  },
]

export const SHIPPED_BORE_GUN_MODULES: readonly BoreGunModule[] = BORE_GUN_MODULES.filter(
  (module) => !module.isHeldBack,
)

/** The shipped module with this item id, or null. */
export function boreGunModuleOf(itemId: string): BoreGunModule | null {
  return SHIPPED_BORE_GUN_MODULES.find((module) => module.itemId === itemId) ?? null
}

/** No slot and no attach id: a module rides on the gun, never in the loadout (#310). */
export function vehicleItemOf(module: BoreGunModule): VehicleItem {
  return { id: module.itemId, iconId: module.iconId, slots: [], attach: null }
}

export function techNodeOf(module: BoreGunModule): TechNode {
  const { node } = module
  return {
    id: node.id,
    iconId: node.iconId,
    lane: BORE_GUN_LANE,
    name: module.name,
    unlockTier: node.unlockTier,
    prereqs: node.prereqs,
    requiresFeature: [BORE_GUN_SCHEDULE_ROW, ...(node.alsoRequiresFeature ?? [])],
    ...(node.requiresDiscovery !== undefined && { requiresDiscovery: node.requiresDiscovery }),
    unlocks: module.itemId,
    description: module.description,
    label: module.label,
    costKind: 'capability',
    marks: markLadderOf(module.itemId),
    familyId: ARMOURY_FAMILY,
  }
}

/** The long barrel's own ladder runs to its Mastered Mark; every other module rotates. */
export function markLadderOf(itemId: string): MarkLadder {
  if (itemId !== LONG_BARREL_ITEM_ID) return moduleLadderOf(itemId)
  return { isIncomeItem: true, lastMark: longBarrelMasteredMark() }
}

/** The one-off price (#162 4.1): `modulePrice` band ore at the planet the module unlocks on. */
export function modulePriceOf(module: BoreGunModule): Money {
  const planet = module.node.unlockTier
  return bandOrePriceAt(GROUND_GUN.modulePrice, planet, planet)
}

function nodeOf(name: string, unlockTier: number, prereqs: readonly string[]): BoreGunNode {
  return {
    id: `tech.bore_gun.${name}`,
    iconId: `node-bore-gun-${name.replaceAll('_', '-')}`,
    unlockTier,
    prereqs: prereqs.map((prereq) => `tech.bore_gun.${prereq}`),
  }
}
