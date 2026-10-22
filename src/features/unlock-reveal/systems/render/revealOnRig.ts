/**
 * The bought part on the car while the reveal plays (ticket 718: "the part shows fitted on the
 * vehicle sprite before the sheet closes"). The part is the item's model: its reveal row's (the
 * turret, the bore gun), else a vehicle item's tech-tree gear (its own parts, so a gauge glows its
 * dial and not the whole cab cluster), else its own `vehicle-item-*` model where the art ships
 * one; an item with none (a combo, a slot cradle) shows on the plate alone. Its parts glow brass
 * through the kernel's
 * `vehicleLooks`, pulsing, or held steady under Reduce Motion. A part the rig draws only while it
 * sits in a slot (a power-up, a drill head, collar or flank: `mountedItemsOf` leaves it out until
 * fitted) hangs at the point of its first slot for the reveal, through the kernel's part-swap
 * request, so a fresh buy shows on the car either way. Render-only: nothing here reaches the
 * authority, a snapshot or a digest.
 */
import { gearAttachIdOf, mountedGearOf, mountedItemsOf } from '../../../tech-tree'
import { assetQuadsOf } from '../../../../systems/art/assetLook'
import { manifestEntryOf, type ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { slotItemAssetIdOf, slotOfPartId } from '../../../../systems/art/artIds'
import type { ItemRef } from '../../../../systems/registries/itemDescriber'
import type { PartSwapRequest } from '../../../../systems/registries/partMotionRequests'
import type { PartGlow, VehicleLook } from '../../../../systems/registries/vehicleLooks'
import { acceptedSlotsOf } from '../../../../systems/registries/vehicleLoadout'
import type { VehicleLoadout } from '../../../../systems/vehicle/loadoutState'
import { REVEAL, type RevealData, type RevealGlow } from '../revealData'
import { revealRowOf, type UnlockReveal } from '../unlockReveal'

/** The asset's own look: every part a model has shows at tier 1. */
const ASSET_LOOK = 1

/** The model that shows the item on the car, and the parts of it that are the item. */
export interface RevealModel {
  assetId: string
  partIds: readonly string[]
}

export function revealModelOf(
  item: ItemRef,
  art: ArtCatalogue,
  data: RevealData = REVEAL,
): RevealModel | null {
  const row = revealRowOf(item, data)
  if (row !== undefined) return wholeModelOf(art, row.assetId)
  if (item.kind !== 'vehicle-item') return null
  return gearModelOf(item.id) ?? ownModelOf(art, item.id)
}

/** The part slots that glow (`slotOfPartId`, so a tier's part glows too), sorted. */
export function glowSlotsOf(model: RevealModel | null): string[] {
  return [...new Set((model?.partIds ?? []).map(slotOfPartId))].sort()
}

function wholeModelOf(art: ArtCatalogue, assetId: string): RevealModel {
  const partIds = assetQuadsOf(art, assetId, ASSET_LOOK).map((quad) => quad.partId)
  return { assetId, partIds }
}

function gearModelOf(itemId: string): RevealModel | null {
  const gear = mountedGearOf(itemId)
  return gear === null
    ? null
    : { assetId: gear.assetId, partIds: gear.parts.map((part) => part.id) }
}

function ownModelOf(art: ArtCatalogue, itemId: string): RevealModel | null {
  const assetId = slotItemAssetIdOf(itemId)
  return manifestEntryOf(art, assetId) === null ? null : wholeModelOf(art, assetId)
}

/** A kept look and its one glow, written in place each frame (`vehicleLooks` asks per frame). */
export interface RevealLook {
  look: VehicleLook
  partGlow: PartGlow
}

export function createRevealLook(colour: string = REVEAL.glow.colour): RevealLook {
  const partGlow: PartGlow = { slots: [], colour, glow: 0 }
  return { look: { tint: null, opacity: 1, outline: null, glows: [partGlow] }, partGlow }
}

/** Writes the glow on `slots` into the kept look and returns the look. */
export function revealLookAt(
  kept: RevealLook,
  slots: readonly string[],
  glow: number,
): VehicleLook {
  kept.partGlow.slots = slots
  kept.partGlow.glow = glow
  return kept.look
}

/** A triangle pulse between `low` and `high`; held at `high` while motion is reduced. */
export function revealGlowAt(
  reveal: UnlockReveal,
  tick: number,
  isMotionReduced: boolean,
  glow: RevealGlow = REVEAL.glow,
): number {
  if (isMotionReduced) return glow.high
  const phase = ((tick - reveal.startTick) % glow.pulseTicks) / glow.pulseTicks
  const rise = 1 - Math.abs(2 * phase - 1)
  return glow.low + (glow.high - glow.low) * rise
}

/**
 * The swap that hangs a bought vehicle item's gear at its point while the rig does not draw it;
 * null for anything the rig already draws, or with no gear or point.
 */
export function revealHangOf(item: ItemRef, loadout: VehicleLoadout): PartSwapRequest | null {
  const gear = item.kind === 'vehicle-item' ? mountedGearOf(item.id) : null
  if (gear === null || isDrawnOnRig(item.id, loadout)) return null
  const attach = gearAttachIdOf(gear, acceptedSlotsOf(item.id)[0] ?? null)
  if (attach === null) return null
  return { kind: 'swap', attach, assetId: gear.assetId, partIds: gear.parts.map((part) => part.id) }
}

function isDrawnOnRig(itemId: string, loadout: VehicleLoadout): boolean {
  return mountedItemsOf(loadout).some((mounted) => mounted.itemId === itemId)
}
