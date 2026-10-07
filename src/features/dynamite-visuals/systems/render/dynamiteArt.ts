/**
 * The dynamite sizes' Blender assets (#145a models, registered by the wiring #215 through
 * `r.artAssets`, #214): the rack at `hull.rear` with a stick per size and the wire reel, and the
 * planted prop with a body and a lamp per size. One part per rung of the kernel's ladder
 * (`blastingCharges.sizes`, K8 #218), so a size the economy table doesn't list is never registered
 * and a new rung fails the asset lint until it is modelled.
 */
import { chargeSizeCount, chargeSizesUpTo } from '../../../../systems/economy/chargeSizes'
import type { ArtAsset } from '../../../../systems/registries/artAssets'

/** Drawn at `hull.rear`: its origin is the attach point (#145a). */
export const DYNAMITE_RACK_ASSET_ID = 'vehicle-dynamite-rack'

/** Every planted size sits at the asset's origin with its pivot at its centre (#145a). */
export const PLANTED_DYNAMITE_ASSET_ID = 'prop-dynamite-charge'

export const RACK_FRAME_PART_ID = 'rack-frame'

/** The plunger's wire reel, shown from the remote detonator's unlock (#153 amendment 2). */
export const WIRE_REEL_PART_ID = 'wire-reel'

export function stickPartIdOf(size: number): string {
  return `stick-${size}`
}

export function plantedPartIdOf(size: number): string {
  return `planted-${size}`
}

export function lampPartIdOf(size: number): string {
  return `lamp-${size}`
}

/** Every size of the kernel's ladder, smallest first. */
export function dynamiteSizes(): number[] {
  return chargeSizesUpTo(chargeSizeCount())
}

export function dynamiteArtAssets(): ArtAsset[] {
  return [
    { id: DYNAMITE_RACK_ASSET_ID, category: 'vehicle', parts: rackPartIds() },
    { id: PLANTED_DYNAMITE_ASSET_ID, category: 'prop', parts: plantedPartIds() },
  ]
}

function rackPartIds(): string[] {
  return [RACK_FRAME_PART_ID, ...dynamiteSizes().map(stickPartIdOf), WIRE_REEL_PART_ID]
}

function plantedPartIds(): string[] {
  return dynamiteSizes().flatMap((size) => [plantedPartIdOf(size), lampPartIdOf(size)])
}
