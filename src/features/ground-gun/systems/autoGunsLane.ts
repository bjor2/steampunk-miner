/**
 * The `armoury.auto_guns` lane (Content's node table on #310 as the GD locked it, ticket 319): the
 * `auto_guns` turret's eight modules as store items, each with its capability node, anchored on the
 * shipped `auto_guns` row (P4) so the lane stays hidden until that row's `FeatureUnlocked`. The
 * lane is re-based on P11 (Content's bend note: P5-P10 are full or held for #308). Every node, item
 * and Mark is filed under the `armoury` spend-guard family; turret modules take the general Mark
 * limits, and Extended barrels' Marks are its own range-then-energy ladder (`boreLadders.ts`).
 *
 * Ticket 388 (#319b) registers all eight: each changes the kernel's turret only through the seams
 * the #319 GD split built for it (`turretShapes.ts`, `flushingShell.ts`), and only while the guns
 * are mounted and the module hangs at its `turret.*` mount (`turretModules.ts`). Mounts are the
 * `turret.*` groups of #364's art (`armouryMounts.json`).
 */
import type { Money } from '../../../systems/money'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { MarkLadder, ProgressionLabel, TechNode } from '../../tech-tree'
import { moduleLadderOf } from './armouryModules'
import { ARMOURY_FAMILY } from './boreGunContent'
import { modulePriceOf } from './boreGunLane'
import { extendedBarrelsMasteredMark } from './boreLadders'

export const AUTO_GUNS_LANE = 'armoury.auto_guns'

/** The shipped schedule row the lane anchors on (#107, P4). */
export const AUTO_GUNS_SCHEDULE_ROW = 'auto_guns'

export const FIRE_DIRECTOR_ITEM_ID = 'weapon.fire_director'
export const SENTRY_CAM_ITEM_ID = 'weapon.sentry_cam'
export const EXTENDED_BARRELS_ITEM_ID = 'weapon.extended_barrels'
export const CONCUSSION_SHELLS_ITEM_ID = 'weapon.concussion_shells'
export const GRAPESHOT_BREECH_ITEM_ID = 'weapon.grapeshot_breech'
export const FLUSHING_SHELL_ITEM_ID = 'weapon.flushing_shell'
export const OVERPRESSURE_BURST_ITEM_ID = 'weapon.overpressure_burst'
export const RICOCHET_SHOT_ITEM_ID = 'weapon.ricochet_shot'

/** Where the module sits on the turret (#364's review groups; the attach ids are the TD's). */
export type TurretMountZone =
  'sight' | 'cam' | 'barrel' | 'breech' | 'magazine' | 'cradle' | 'boiler' | 'hopper'

/** One module of the lane as Content's table writes it. */
export interface AutoGunsModule {
  itemId: string
  name: string
  iconId: string
  /** The flavour line: no digits, never "rig" (#159). */
  description: string
  label: ProgressionLabel
  mount: TurretMountZone
  /** Never registered until a kernel seam reaches its effect (all eight reach one since #388). */
  isHeldBack: boolean
  node: AutoGunsNode
}

export interface AutoGunsNode {
  id: string
  iconId: string
  /** The placed planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
  requiresDiscovery?: DiscoveryKey
}

export const AUTO_GUNS_MODULES: readonly AutoGunsModule[] = [
  {
    itemId: FIRE_DIRECTOR_ITEM_ID,
    name: 'Fire director',
    iconId: 'item-weapon-fire-director',
    description: 'A brass director ranks the pack and turns the turrets on the rearmost first.',
    label: 'horizontal',
    mount: 'sight',
    isHeldBack: false,
    node: nodeOf('fire_director', 11, []),
  },
  {
    itemId: SENTRY_CAM_ITEM_ID,
    name: 'Sentry cam',
    iconId: 'item-weapon-sentry-cam',
    description: 'An iron cam swings the turrets over the drill face the moment the drill rests.',
    label: 'horizontal',
    mount: 'cam',
    isHeldBack: false,
    node: nodeOf('sentry_cam', 14, ['fire_director']),
  },
  {
    itemId: EXTENDED_BARRELS_ITEM_ID,
    name: 'Extended barrels',
    iconId: 'item-weapon-extended-barrels',
    description: 'Extended steel barrels carry every shell a tile further down the gallery.',
    label: 'both',
    mount: 'barrel',
    isHeldBack: false,
    node: nodeOf('extended_barrels', 19, ['fire_director']),
  },
  {
    itemId: CONCUSSION_SHELLS_ITEM_ID,
    name: 'Concussion shells',
    iconId: 'item-weapon-concussion-shells',
    description: 'A blunt brass shell lands like a hammer and throws the biter off its lunge.',
    label: 'horizontal',
    mount: 'magazine',
    isHeldBack: false,
    node: nodeOf('concussion_shells', 22, ['fire_director']),
  },
  {
    itemId: GRAPESHOT_BREECH_ITEM_ID,
    name: 'Grapeshot breech',
    iconId: 'item-weapon-grapeshot-breech',
    description: 'A hinged breech packs loose iron shot that scatters its one bite across a pack.',
    label: 'horizontal',
    mount: 'breech',
    isHeldBack: false,
    node: nodeOf('grapeshot_breech', 26, ['extended_barrels']),
  },
  {
    itemId: FLUSHING_SHELL_ITEM_ID,
    name: 'Flushing shell',
    iconId: 'item-weapon-flushing-shell',
    description: 'A fat iron shell thumps the rock face and the shiver drives the burrower out.',
    label: 'horizontal',
    mount: 'cradle',
    isHeldBack: false,
    node: nodeOf('flushing_shell', 30, ['concussion_shells']),
  },
  {
    itemId: OVERPRESSURE_BURST_ITEM_ID,
    name: 'Overpressure burst',
    iconId: 'item-weapon-overpressure-burst',
    description: 'Held steam crowds the boiler and the guns rattle fast until the vent blows.',
    label: 'horizontal',
    mount: 'boiler',
    isHeldBack: false,
    node: nodeOf('overpressure_burst', 35, ['extended_barrels']),
  },
  {
    itemId: RICOCHET_SHOT_ITEM_ID,
    name: 'Ricochet shot',
    iconId: 'item-weapon-ricochet-shot',
    description: 'A hardened steel ball skips once off the pocket wall to find what hides behind.',
    label: 'horizontal',
    mount: 'hopper',
    isHeldBack: false,
    node: {
      ...nodeOf('ricochet_shot', 36, ['extended_barrels']),
      requiresDiscovery: 'hazard:hollow',
    },
  },
]

export const SHIPPED_AUTO_GUNS_MODULES: readonly AutoGunsModule[] = AUTO_GUNS_MODULES.filter(
  (module) => !module.isHeldBack,
)

/** The shipped turret module with this item id, or null. */
export function autoGunsModuleOf(itemId: string): AutoGunsModule | null {
  return SHIPPED_AUTO_GUNS_MODULES.find((module) => module.itemId === itemId) ?? null
}

/** No slot and no attach id: a module rides on the turret, never in the loadout (#310). */
export function autoGunsVehicleItemOf(module: AutoGunsModule): VehicleItem {
  return { id: module.itemId, iconId: module.iconId, slots: [], attach: null }
}

export function autoGunsTechNodeOf(module: AutoGunsModule): TechNode {
  const { node } = module
  return {
    id: node.id,
    iconId: node.iconId,
    lane: AUTO_GUNS_LANE,
    name: module.name,
    unlockTier: node.unlockTier,
    prereqs: node.prereqs,
    requiresFeature: [AUTO_GUNS_SCHEDULE_ROW],
    ...(node.requiresDiscovery !== undefined && { requiresDiscovery: node.requiresDiscovery }),
    unlocks: module.itemId,
    description: module.description,
    label: module.label,
    costKind: 'capability',
    marks: autoGunsMarkLadderOf(module.itemId),
    familyId: ARMOURY_FAMILY,
  }
}

/** Extended barrels' own ladder runs to its Mastered Mark; every other module rotates. */
export function autoGunsMarkLadderOf(itemId: string): MarkLadder {
  if (itemId !== EXTENDED_BARRELS_ITEM_ID) return moduleLadderOf(itemId)
  return { isIncomeItem: false, lastMark: extendedBarrelsMasteredMark() }
}

/** The one-off price (#162 4.1), the bore modules' rule: band ore at the unlock planet. */
export function autoGunsModulePriceOf(module: AutoGunsModule): Money {
  return modulePriceOf(module)
}

function nodeOf(name: string, unlockTier: number, prereqs: readonly string[]): AutoGunsNode {
  return {
    id: `tech.auto_guns.${name}`,
    iconId: `node-auto-guns-${name.replaceAll('_', '-')}`,
    unlockTier,
    prereqs: prereqs.map((prereq) => `tech.auto_guns.${prereq}`),
  }
}
