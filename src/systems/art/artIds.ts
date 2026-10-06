/**
 * Art ids (#52 "Ids and naming"): kebab-case, derived from the registry ids by replacing `_` with
 * `-`, so art cannot drift from the code. The asset inventory is #51's; the rules shared with the
 * Blender export (vehicle part names, px per metre, atlas limits) live in `art/asset-rules.json`,
 * which `scripts/art/asset_layout.py` reads too.
 */
import ASSET_RULES from '../../../art/asset-rules.json'
import { BAND_COUNT } from '../world/planetGeometry'
import { ENEMY_IDS, PLATFORM_BAY_IDS, PLATFORM_VISUAL_STATES, UPGRADE_IDS } from '../registeredIds'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

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

const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TIER_PREFIX = /^t([1-9][0-9]*)-/

export function kebabOf(registryId: string): string {
  return registryId.replaceAll('_', '-')
}

export function isKebabId(id: string): boolean {
  return KEBAB_ID.test(id)
}

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

/** Every Blender asset of the #51 inventory and the vehicle modules, named from the registries (#52). */
export function blenderAssetIds(): string[] {
  return [
    'vehicle',
    ...vehicleModuleRowIds().map(vehicleModuleAssetIdOf),
    'platform-hub',
    ...PLATFORM_BAY_IDS.map((bay) => `platform-bay-${bay}`),
    ...PLATFORM_BAY_IDS.map((bay) => `platform-bay-${bay}-backdrop`),
    ...enemyArtKinds().map((kind) => `enemy-${kebabOf(kind)}`),
    'prop-artefact-cache',
    ...numbered('ground-band', BAND_COUNT),
    ...numbered('casing-grade', CASING_GRADE_COUNT),
  ]
}

/**
 * Every vector icon file stem, which is also its `data-testid` (#51 acceptance 3): one per upgrade
 * track, the casing row's icon (#54 scope review) and the two bay emblems (#51 "HUD and bay chrome").
 */
export function vectorIconIds(): string[] {
  return [
    ...UPGRADE_IDS.map(trackIconIdOf),
    CASING_ICON_ID,
    ...PLATFORM_BAY_IDS.map((bay) => `emblem-bay-${bay}`),
  ]
}

/** The Casing row's icon, the seventh vector icon (#54 scope review). */
export const CASING_ICON_ID = 'icon-casing'

/** An upgrade track's icon (#44 `icon-track-<id>`, in the #52 kebab form of the registry id). */
export function trackIconIdOf(track: string): string {
  return `icon-track-${kebabOf(track)}`
}

/**
 * Enemy rows of the locked schedule (#80) whose art ticket ran before their module adds the kind to
 * `economy.json`: `tunnel_wrecker` (#112, spec #111, build #94). The schedule row id is the kind id
 * the module will register, so the art id stays derived from a registry (#52).
 */
export const SCHEDULED_ENEMY_ART_ROW_IDS: readonly string[] = ['tunnel_wrecker']

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
 * Part ids outside the vehicle: each single-part asset's own id, and the hub's two visual states
 * (#8 `outpost`, `core_drive`), which are its collections in Blender (#52).
 */
export function registryPartIds(): string[] {
  return [...blenderAssetIds(), ...PLATFORM_VISUAL_STATES.map(kebabOf)]
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
