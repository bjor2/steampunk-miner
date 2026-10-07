/**
 * Art ids (#52 "Ids and naming"): kebab-case, derived from the registry ids by replacing `_` with
 * `-`, so art cannot drift from the code. The asset inventory is #51's; the rules shared with the
 * Blender export (vehicle part names, px per metre, atlas limits) live in `art/asset-rules.json`,
 * which `scripts/art/asset_layout.py` reads too.
 */
import ASSET_RULES from '../../../art/asset-rules.json'
import { REFINERY_BAY_LOOKS } from '../authority/platformState'
import { registeredArtAssets } from '../registries/artAssets'
import { BAND_COUNT } from '../world/planetGeometry'
import { ENEMY_IDS, PLATFORM_BAY_IDS, PLATFORM_VISUAL_STATES } from '../registeredIds'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { kebabOf } from './artNaming'
import { iconFileIds } from './icons/iconSet'
import { BLASTING_CHARGES_ROW_ID, HEAT_LAVA_ROW_ID, REFRACTORY_LINING_TYPE } from './moduleRowIds'
import {
  SHOP_BUILDING_BAY_IDS,
  shopBuildingAssetIds,
  shopBuildingMovingPartIds,
} from './shopBuildingArt'
import { workshopShowcaseAssetIds, workshopShowcasePartIds } from './workshopShowcaseArt'

export const ASSET_CATEGORIES = [
  'vehicle',
  'platform',
  'enemy',
  'prop',
  'ground',
  'casing',
] as const

/** The `public/assets/<category>/` folder an exported asset lands in (#52 "Folders"). */
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const MAP_KINDS = ['albedo', 'normal', 'emissive'] as const

export type MapKind = (typeof MAP_KINDS)[number]

export const ART_RULES = ASSET_RULES

/** #51: one casing lining with five grade patterns, ground in the five depth bands. */
const CASING_GRADE_COUNT = 5

const TIER_PREFIX = /^t([1-9][0-9]*)-/

export { isKebabId, kebabOf } from './artNaming'

/** `vehicle`, or the prefix before the first dash (`enemy-crawler` is an enemy). */
export function categoryOfAssetId(assetId: string): AssetCategory | null {
  return ASSET_CATEGORIES.find((category) => isOfCategory(assetId, category)) ?? null
}

function isOfCategory(assetId: string, category: AssetCategory): boolean {
  return assetId === category || assetId.startsWith(`${category}-`)
}

/**
 * Schedule rows (`docs/scaling/horizontal/stats.json`) whose unlock shows on the vehicle as a part
 * family of its own (#81 acceptance 3), with the part names each family may use. A family is drawn
 * in the vehicle's frame, so it sits on the hull, and its tiers are the module's looks (#107: the
 * gun barrel at its level breakpoints), not the vehicle's visual tier.
 */
const VEHICLE_MODULE_PARTS: Readonly<Record<string, readonly string[]>> =
  ASSET_RULES.vehicleModuleParts

export function vehicleModuleRowIds(): string[] {
  return Object.keys(VEHICLE_MODULE_PARTS)
}

/** `auto_guns` draws as `vehicle-auto-guns` (#52 kebab form under the vehicle category). */
export function vehicleModuleAssetIdOf(rowId: string): string {
  return `vehicle-${kebabOf(rowId)}`
}

/**
 * A slot-drawn item's own model (TD on #162: every `attach: "slot"` power-up ships one, drawn at
 * `hull.powerup.n`): `mobility.steam_shield` is `vehicle-item-mobility-steam-shield`, named like the
 * item's `item-` icon (#158) under the vehicle category.
 */
export function slotItemAssetIdOf(itemId: string): string {
  return `vehicle-item-${kebabOf(itemId).replaceAll('.', '-')}`
}

/**
 * Every Blender asset: the kernel's and the ones slices register (#214), sorted by code unit. The
 * manifest lint and the Blender export (`scripts/art/listBlenderAssetIds.ts`) both read this list.
 */
export function blenderAssetIds(): string[] {
  return [...kernelBlenderAssetIds(), ...registeredArtAssets().map((asset) => asset.id)].sort()
}

/** The #51 inventory and the vehicle modules, named from the registries (#52). */
export function kernelBlenderAssetIds(): string[] {
  return [
    'vehicle',
    ...vehicleModuleRowIds().map(vehicleModuleAssetIdOf),
    // The hub and the Sell and Upgrade bays retired into the two buildings (#170, #175); the
    // Refinery keeps its bay art until it moves behind the yard.
    ...unbuiltBayIds().map((bay) => `platform-bay-${bay}`),
    ...unbuiltBayIds().map((bay) => `platform-bay-${bay}-backdrop`),
    ...shopBuildingAssetIds(),
    ...workshopShowcaseAssetIds(),
    ...enemyArtKinds().map((kind) => `enemy-${kebabOf(kind)}`),
    'prop-artefact-cache',
    ...numbered('ground-band', BAND_COUNT),
    ...numbered('casing-grade', CASING_GRADE_COUNT),
    CHARGE_RACK_ASSET_ID,
    PLANTED_CHARGE_ASSET_ID,
    LAVA_TILE_ASSET_ID,
    ...refractoryCasingTileIds(),
  ]
}

/** The bays with no building of their own: the Refinery. */
function unbuiltBayIds(): string[] {
  return PLATFORM_BAY_IDS.filter((bay) => !SHOP_BUILDING_BAY_IDS.some((built) => built === bay))
}

/**
 * Every vector icon file stem, which is also its `data-testid` (#51 acceptance 3): the icon set of
 * #158, one entry per upgrade track, module row, HUD gauge, status, enemy, artefact, panel and
 * button, plus one emblem per bay (#51 "HUD and bay chrome"). The set derives each id from its
 * registry (`icons/iconSet.ts`); ore icons are generated, not files, so they are not listed here.
 */
export function vectorIconIds(): string[] {
  return iconFileIds()
}

export {
  SHOP_BUILDING_ATTACH_IDS,
  SHOP_BUILDING_BAY_IDS,
  shopBuildingAssetIdOf,
  shopBuildingMovingPartIdsOf,
  shopBuildingShellPartIdOf,
} from './shopBuildingArt'

export {
  reactionMajorPartIdOf,
  reactionStepPartIdOf,
  showcaseArmPartIdsOf,
  showcaseRigPartIds,
  UPGRADE_REACTION_ATTACH_IDS,
  UPGRADE_REACTIONS_ASSET_ID,
  upgradeReactionPartIds,
  upgradeReactionRowIds,
  WORKSHOP_SHOWCASE_ASSET_ID,
} from './workshopShowcaseArt'

export {
  BLASTING_CHARGES_ICON_ID,
  CASING_ICON_ID,
  GUN_ICON_ID,
  HEAT_GAUGE_ICON_ID,
  REFRACTORY_LINING_ICON_ID,
  trackIconIdOf,
} from './icons/iconSet'

/**
 * The art of the `blasting_charges` schedule row (#109 "Visibility", #110): a charge rack mounted
 * on the vehicle, a planted charge with its fuse lamp, and an icon for its Upgrade bay rows and HUD
 * count. The ids take the #52 kebab form of the row id.
 */
export {
  BLASTING_CHARGES_ROW_ID,
  HEAT_LAVA_ROW_ID,
  REFRACTORY_LINING_ROW_ID,
  REFRACTORY_LINING_TYPE,
} from './moduleRowIds'

const BLASTING_CHARGES = kebabOf(BLASTING_CHARGES_ROW_ID)

/** Drawn at the vehicle's origin, in the vehicle's frame, once the rack is bought. */
export const CHARGE_RACK_ASSET_ID = `vehicle-${BLASTING_CHARGES}`

/** One charge planted on the wall; its `fuse-lamp` is its own part so it can blink. */
export const PLANTED_CHARGE_ASSET_ID = 'prop-blasting-charge'

export const FUSE_LAMP_PART_ID = 'fuse-lamp'

/**
 * The rack's frame, then `charge-<n>` for each of its `chargeRackSlots` (#109 `rackMax`); the rack
 * shows `charge-1` to `charge-<count>` for the count carried.
 */
export function chargeRackPartIds(): string[] {
  return ['charge-rack', ...numbered('charge', ART_RULES.chargeRackSlots)]
}

/**
 * The art of the `heat_lava` and `refractory_lining` schedule rows (#113 "Visibility", #114): the
 * lava pockets' tile, the refractory lining's tiles, the heat gauge's icon and the lining type's
 * icon. The ids take the #52 kebab form of the row ids; the refractory tiles take the lining type
 * #113 names (`standard` keeps the `casing-grade-<n>` tiles).
 */
/** Lava pockets, the fluid ground of heat planets; molten veins under a crust, which glow. */
export const LAVA_TILE_ASSET_ID = `ground-${kebabOf(HEAT_LAVA_ROW_ID)}`

/**
 * `casing-refractory-grade-1` to `-5`: a refractory ring keeps its grade's plate and rivet pattern
 * (#48 acceptance 5: grade reads without colour) in firebrick with glowing seams (#113).
 */
export function refractoryCasingTileIds(): string[] {
  return numbered(`casing-${REFRACTORY_LINING_TYPE}-grade`, CASING_GRADE_COUNT)
}

/**
 * Enemy rows of the locked schedule (#80) whose art ticket ran before their module adds the kind to
 * `economy.json`. The schedule row id is the kind id the module will register, so the art id stays
 * derived from a registry (#52). None now: `tunnel_wrecker` (#112) is an economy kind since #94.
 */
export const SCHEDULED_ENEMY_ART_ROW_IDS: readonly string[] = []

/** The economy's enemy kinds, then each scheduled Enemy row with art that is not one of them yet. */
export function enemyArtKinds(): string[] {
  return [...ENEMY_IDS, ...scheduledEnemyArtKinds().filter((kind) => !ENEMY_IDS.includes(kind))]
}

function scheduledEnemyArtKinds(): string[] {
  return LOCKED_SCHEDULE.rows
    .filter((row) => row.lane === 'Enemy' && SCHEDULED_ENEMY_ART_ROW_IDS.includes(row.id))
    .map((row) => row.id)
}

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, at) => `${prefix}-${at + 1}`)
}

/**
 * Part ids outside the vehicle: each single-part asset's own id, the hub's two visual states
 * (#8 `outpost`, `core_drive`), which are its collections in Blender (#52), the refinery
 * bay's three looks drawn over its frame (#105), the charge rack's slots, the planted
 * charge's fuse lamp, the shop buildings' moving parts (#170), the Workshop showcase's rig
 * and reaction pieces (#180) and the parts each slice asset names (#214).
 */
export function registryPartIds(): string[] {
  return [
    ...blenderAssetIds(),
    ...PLATFORM_VISUAL_STATES.map(kebabOf),
    ...REFINERY_BAY_LOOKS.map(refineryLookPartIdOf),
    ...chargeRackPartIds(),
    FUSE_LAMP_PART_ID,
    ...shopBuildingMovingPartIds(),
    ...workshopShowcasePartIds(),
    ...registeredArtAssets().flatMap((asset) => asset.parts ?? []),
  ]
}

/** The refinery bay part that shows one of its looks: `refinery-idle`, `-refining`, `-ready`. */
export function refineryLookPartIdOf(look: string): string {
  return `refinery-${kebabOf(look)}`
}

/** A tiered part is `t<tier>-<part>`, a repeat adds `-<n>` from 2 (`t1-wheel-2`). */
function isTieredPartId(partId: string, partNames: readonly string[]): boolean {
  const match = /^t[1-9][0-9]*-(.+?)(-[2-9]|-[1-9][0-9]+)?$/.exec(partId)
  return match !== null && partNames.includes(match[1])
}

export function isVehiclePartId(partId: string): boolean {
  return isTieredPartId(partId, ART_RULES.vehiclePartNames)
}

/** The part names of a tiered asset (the vehicle or a vehicle module), or null for any other. */
function tieredPartNamesOf(assetId: string): readonly string[] | null {
  if (assetId === 'vehicle') return ART_RULES.vehiclePartNames
  const rowId = vehicleModuleRowIds().find((row) => vehicleModuleAssetIdOf(row) === assetId)
  return rowId === undefined ? null : VEHICLE_MODULE_PARTS[rowId]
}

export function isValidPartId(assetId: string, partId: string): boolean {
  const partNames = tieredPartNamesOf(assetId)
  return partNames === null ? registryPartIds().includes(partId) : isTieredPartId(partId, partNames)
}

/** The tier a `t<tier>-` id names, or null for an id without one. */
export function tierOfPartId(partId: string): number | null {
  const match = TIER_PREFIX.exec(partId)
  return match === null ? null : Number.parseInt(match[1], 10)
}

/**
 * The slot a part fills, its id without the tier: `t3-wheel-2` replaces `t1-wheel-2`, so a higher
 * tier holds only added or replaced parts (#52 "Blender scene conventions").
 */
export function slotOfPartId(partId: string): string {
  return partId.replace(TIER_PREFIX, '')
}

export function pxPerMetreOf(category: AssetCategory): number {
  return ART_RULES.pxPerMetre[category]
}
