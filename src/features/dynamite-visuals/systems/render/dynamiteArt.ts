/**
 * The dynamite Blender assets (#145a models, registered by the wiring #215 through `r.artAssets`,
 * #214; the D7 art of ticket 866): the rack at `hull.rear` with a bay per charge type, its stock
 * pips, the detonator's reel and plunger and the Blast Casing nozzle; the planted prop with a body
 * and a lamp per size; and the crater decals a blast leaves, one per type and the lined rim. One
 * planted part per rung of the kernel's ladder (`blastingCharges.sizes`, K8 #218) and one bay per
 * type of it, so a size or type the economy table doesn't list is never registered.
 */
import { rackCapacity, rackMaxSlotLevel } from '../../../../systems/economy/blastingCharges'
import { chargeSizeCount, chargeSizesUpTo } from '../../../../systems/economy/chargeSizes'
import type { ArtAsset } from '../../../../systems/registries/artAssets'
import { chargeTypes, DYNAMITE_LOOKS } from './chargeTypeLook'

/** Drawn at `hull.rear`: its origin is the attach point (#145a). */
export const DYNAMITE_RACK_ASSET_ID = 'vehicle-dynamite-rack'

/** Every planted size sits at the asset's origin with its pivot at its centre (#145a). */
export const PLANTED_DYNAMITE_ASSET_ID = 'prop-dynamite-charge'

/** Every decal is a 1 m disc with its pivot at its centre, scaled to the crater (ticket 866). */
export const BLAST_CRATER_ASSET_ID = 'prop-blast-crater'

export const RACK_FRAME_PART_ID = 'rack-frame'

/** The plunger's wire reel, shown from the remote detonator's unlock (#153 amendment 2). */
export const WIRE_REEL_PART_ID = 'wire-reel'

/** The plunger box beside the reel, from the same unlock (ticket 866). */
export const PLUNGER_PART_ID = 'plunger'

/** The bay a type's bundle stands in. */
export function slotPartIdOf(type: number): string {
  return `slot-${type}`
}

/** The `n`th lit stock pip under a type's bay, `n` from 1. */
export function pipPartIdOf(type: number, n: number): string {
  return `pip-${type}-${n}`
}

/** The pips a bay shows at most: the rack's full eight slots, so a full rack lights every pip. */
export function pipsPerType(): number {
  return rackCapacity(rackMaxSlotLevel())
}

export function plantedPartIdOf(size: number): string {
  return `planted-${size}`
}

export function lampPartIdOf(size: number): string {
  return `lamp-${size}`
}

/** Every size of the kernel's ladder, smallest first: each has a planted body and a lamp. */
export function dynamiteSizes(): number[] {
  return chargeSizesUpTo(chargeSizeCount())
}

export function dynamiteArtAssets(): ArtAsset[] {
  return [
    { id: DYNAMITE_RACK_ASSET_ID, category: 'vehicle', parts: rackPartIds() },
    { id: PLANTED_DYNAMITE_ASSET_ID, category: 'prop', parts: plantedPartIds() },
    { id: BLAST_CRATER_ASSET_ID, category: 'prop', parts: craterPartIds() },
  ]
}

function rackPartIds(): string[] {
  return [
    RACK_FRAME_PART_ID,
    ...chargeTypes().flatMap(bayPartIdsOf),
    WIRE_REEL_PART_ID,
    PLUNGER_PART_ID,
    DYNAMITE_LOOKS.casing.nozzlePart,
  ]
}

function bayPartIdsOf(type: number): string[] {
  const pips = Array.from({ length: pipsPerType() }, (_, at) => pipPartIdOf(type, at + 1))
  return [slotPartIdOf(type), ...pips]
}

function plantedPartIds(): string[] {
  return dynamiteSizes().flatMap((size) => [plantedPartIdOf(size), lampPartIdOf(size)])
}

function craterPartIds(): string[] {
  const { rimPart, trimPart } = DYNAMITE_LOOKS.casing
  return [...DYNAMITE_LOOKS.types.map((row) => row.crater), rimPart, trimPart]
}
