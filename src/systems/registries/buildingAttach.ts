/**
 * Named points on the two shop buildings (#170 "Attach points", the TD's kernel `building-attach`
 * registry): the Game Director's seven ids, each on the building its prefix names (`sell.` the
 * Assay & Exchange, `workshop.` the Engineering Works), read from that building's sidecar `attach`
 * array (#174). Render-only, like vehicle attach (feature-slices.md 3.11): a point never enters
 * the authority state, a snapshot or a digest. A slice registers each use it makes of a point
 * (the auto-roll onto `workshop.platform`, the sell burst at `sell.chute`), so the readers of every
 * point are listed in one place.
 */
import { defineRegistry, entriesOf } from './seal'

export const BUILDING_ATTACH_IDS = [
  'sell.chute',
  'sell.ticker',
  'sell.stack',
  'workshop.gantry',
  'workshop.platform',
  'workshop.stack',
  'workshop.showcase_cam',
] as const

export type BuildingAttachId = (typeof BUILDING_ATTACH_IDS)[number]

/** The bay whose building carries the point: `sell`, or `upgrade` for the Workshop. */
export type AttachBuildingBay = 'sell' | 'upgrade'

export interface BuildingAttachUse {
  id: string
  attach: BuildingAttachId
}

export const BUILDING_ATTACH_USE_REGISTRY = defineRegistry<BuildingAttachUse>('buildingAttach')

export function buildingBayOfAttach(attach: BuildingAttachId): AttachBuildingBay {
  return attach.startsWith('sell.') ? 'sell' : 'upgrade'
}

/** The building's own points, in the Game Director's order. */
export function attachIdsOfBuilding(bay: AttachBuildingBay): BuildingAttachId[] {
  return BUILDING_ATTACH_IDS.filter((attach) => buildingBayOfAttach(attach) === bay)
}

/** Every registered use, sorted by id. */
export function buildingAttachUses(): readonly BuildingAttachUse[] {
  return entriesOf(BUILDING_ATTACH_USE_REGISTRY)
}
