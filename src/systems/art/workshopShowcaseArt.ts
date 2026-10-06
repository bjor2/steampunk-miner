/**
 * The Workshop showcase of #180 (art #182): the rig that works on the car while it stands on the
 * Workshop's turntable, and the reaction pieces the rig brings to each upgrade row.
 *
 * The rig is one platform asset in the building's frame (its origin is `workshop.platform`, the
 * turntable's centre, like `platform-building-upgrade`): an overhead rail with the hoist that runs
 * it (trolley, chain and hook), two gantry arms of two segments each, and a cradle lift on the
 * turntable. The reaction pieces are one prop asset at the vehicle's density, since every piece is
 * vehicle-scale (#52: props and the vehicle bake at 512 px/m, platform art at 256): per row of the
 * Gameplay & Vehicle reaction table, the tool an arm darts in with on a small step and the
 * component the hoist lowers on a big level-up. Every piece is gripped or hoisted at its top centre
 * and its pivot is its bottom centre, the point that meets the car's attach point.
 *
 * The ids derive from the zone prefix of the Workshop building's attach ids (`workshop.*`, #170),
 * and the piece ids from the rows: the six upgrade tracks, the gun track, the blasting charges row
 * and the Upgrade bay's casing row. The reactions key to the render-only `vehicle-attach` ids the
 * Game Director locked on #180 section 1 (`drill_power` on `drill.housing`); K5 (#188) registers
 * the showcase ids, and the workshop build (#177) animates the pieces.
 */
import { GUN_TRACK_ID } from '../economy/gunStats'
import { UPGRADE_IDS } from '../registeredIds'
import { kebabOf } from './artNaming'
import { BLASTING_CHARGES_ROW_ID } from './moduleRowIds'
import { SHOP_BUILDING_ATTACH_IDS } from './shopBuildingArt'

/** The Upgrade bay's casing row (`rows.casing` in `upgradeBayModel.ts`, icon `icon-casing`). */
const CASING_ROW_ID = 'casing'

const WORKSHOP_ZONE = zonePrefixOf(SHOP_BUILDING_ATTACH_IDS.upgrade)

/** The rig: rail, hoist, arms and lift, in the Workshop building's frame. */
export const WORKSHOP_SHOWCASE_ASSET_ID = `platform-${WORKSHOP_ZONE}-showcase`

/** The reaction pieces: a tool and a component per upgrade row, at the vehicle's density. */
export const UPGRADE_REACTIONS_ASSET_ID = `prop-${WORKSHOP_ZONE}-reactions`

/** The hoist that runs the rail, from the carriage down to the hook the component hangs on. */
export const SHOWCASE_HOIST_PART_IDS = [
  'showcase-rail',
  'showcase-trolley',
  'showcase-chain',
  'showcase-hook',
] as const

export const SHOWCASE_ARM_SIDES = ['left', 'right'] as const

export type ShowcaseArmSide = (typeof SHOWCASE_ARM_SIDES)[number]

/** The cradle on the turntable that raises the car for work on its drive. */
export const SHOWCASE_LIFT_PART_ID = 'showcase-lift'

/** The upper arm hangs from its shoulder bearing; the forearm, with the gripper, from the elbow. */
export function showcaseArmPartIdsOf(side: ShowcaseArmSide): [string, string] {
  return [`showcase-arm-upper-${side}`, `showcase-arm-fore-${side}`]
}

export function showcaseRigPartIds(): string[] {
  return [
    ...SHOWCASE_HOIST_PART_IDS,
    ...SHOWCASE_ARM_SIDES.flatMap(showcaseArmPartIdsOf),
    SHOWCASE_LIFT_PART_ID,
  ]
}

/**
 * Which part of the car each row's reaction touches (G&V's table on #180, with the Game
 * Director's `drill.housing` ruling for `drill_power` and the TD's `hull.liner` for casing).
 */
export const UPGRADE_REACTION_ATTACH_IDS: Readonly<Record<string, string>> = {
  drill_power: 'drill.housing',
  drill_tip: 'drill.head',
  engine: 'chassis.drive',
  boiler: 'hull.boiler',
  cargo_hold: 'hull.cargo',
  hull: 'hull.plates',
  [GUN_TRACK_ID]: 'hull.turret',
  [BLASTING_CHARGES_ROW_ID]: 'hull.rear',
  [CASING_ROW_ID]: 'hull.liner',
}

/**
 * The six #180 showcase points plus `drill.housing`, render-only ids the TD accepted into K5
 * (#188); listed here until that registry lands, so the reaction rows can be checked against the
 * attach ids they will resolve on.
 */
export const SHOWCASE_ATTACH_IDS = [
  'chassis.drive',
  'hull.boiler',
  'hull.stack',
  'hull.cargo',
  'hull.plates',
  'hull.liner',
  'drill.housing',
] as const

/** Every row with a reaction: the six tracks, then the gun, charges and casing rows. */
export function upgradeReactionRowIds(): string[] {
  return [...UPGRADE_IDS, GUN_TRACK_ID, BLASTING_CHARGES_ROW_ID, CASING_ROW_ID]
}

/** The tool an arm brings on a small step: `drill-power-step`. */
export function reactionStepPartIdOf(rowId: string): string {
  return `${kebabOf(rowId)}-step`
}

/** The component the hoist lowers on a big level-up: `drill-power-major`. */
export function reactionMajorPartIdOf(rowId: string): string {
  return `${kebabOf(rowId)}-major`
}

export function upgradeReactionPartIds(): string[] {
  return upgradeReactionRowIds().flatMap((row) => [
    reactionStepPartIdOf(row),
    reactionMajorPartIdOf(row),
  ])
}

export function workshopShowcaseAssetIds(): string[] {
  return [WORKSHOP_SHOWCASE_ASSET_ID, UPGRADE_REACTIONS_ASSET_ID]
}

/** Every part of both assets, for the registry of part ids outside the vehicle. */
export function workshopShowcasePartIds(): string[] {
  return [...showcaseRigPartIds(), ...upgradeReactionPartIds()]
}

/** `workshop` from `workshop.platform` and its siblings; they share one zone by construction. */
function zonePrefixOf(attachIds: readonly string[]): string {
  const prefixes = new Set(attachIds.map((id) => id.split('.')[0]))
  if (prefixes.size !== 1) throw new Error(`attach ids span zones: ${attachIds.join(', ')}`)
  return [...prefixes][0]
}
