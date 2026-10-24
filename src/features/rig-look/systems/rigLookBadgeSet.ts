/**
 * Every finish badge a rig shows (ticket 809): one for each line past its authored art, the six
 * upgrade tracks from the rig look table and the fuel tank from the coal tender's log tail, each
 * at its own attach point inside the body's box at the rig's visual tier. A line still on its
 * authored steps shows no badge; its art is the look. Pure, from the owned levels and the art
 * catalogue the caller passes; the scene draws the answer.
 */
import type { ArtCatalogue } from '../../../systems/art/artCatalogue'
import { FUEL_TENDER_ATTACH_ID } from '../../../systems/art/fuelTenderArt'
import { fuelTenderLookOf } from '../../../systems/render/fuelTenderLook'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { isAttachId } from '../../../systems/registries/vehicleAttach'
import { badgeAt, type BodyBox, type RigLookBadge } from './render/rigLookBadges'
import { lookFrameAt, type TrackLookFrames } from './render/rigLookFrames'
import { rigLookIndexOf } from './render/rigLookIndex'
import type { RigLooks } from './rigLooks'

/** The badge line the fuel tank's log tail draws under. */
export const FUEL_TANK_LINE = 'fuel_tank'

/** The tender's finishes are named colours: drawn as a worked metal. */
const TENDER_FINISH_MATERIAL = { metalness: 0.8, roughness: 0.4 }

/** What a rig owns: each track's purchases and the tank's level. */
export interface OwnedLevels {
  purchasesOf(track: string): number
  tankLevel: number
}

/** The badges `owned` shows on the rig drawn at `visualTier`, tracks in table order, tank last. */
export function rigLookBadgesOf(
  looks: RigLooks,
  owned: OwnedLevels,
  art: ArtCatalogue,
  visualTier: number,
): RigLookBadge[] {
  const body = bodyBoxOf(art, visualTier)
  const tracks = looks.tracks.flatMap((frames) => trackBadgesOf(looks, frames, owned, art, body))
  return [...tracks, ...tankBadgesOf(owned.tankLevel, art, body)]
}

/** The box round the rig body's parts at a tier: the bounds no badge may pass. */
export function bodyBoxOf(art: ArtCatalogue, visualTier: number): BodyBox {
  const quads = vehicleBodyQuadsOf(art, visualTier)
  return {
    left: Math.min(...quads.map((quad) => quad.centre[0] - quad.size[0] / 2)),
    bottom: Math.min(...quads.map((quad) => quad.centre[1] - quad.size[1] / 2)),
    right: Math.max(...quads.map((quad) => quad.centre[0] + quad.size[0] / 2)),
    top: Math.max(...quads.map((quad) => quad.centre[1] + quad.size[1] / 2)),
  }
}

function trackBadgesOf(
  looks: RigLooks,
  frames: TrackLookFrames,
  owned: OwnedLevels,
  art: ArtCatalogue,
  body: BodyBox,
): RigLookBadge[] {
  const { track, slot } = frames.rows
  const n = owned.purchasesOf(track)
  const { finish } = lookFrameAt(frames, n)
  const anchor = isAttachId(slot) ? vehicleAttachPointOf(art, slot) : null
  if (finish === null || anchor === null) return []
  const { pips } = rigLookIndexOf(frames.rows, n)
  return [badgeAt(track, looks.finishes[finish], pips, anchor.atM, body)]
}

function tankBadgesOf(tankLevel: number, art: ArtCatalogue, body: BodyBox): RigLookBadge[] {
  const { tint, pips } = fuelTenderLookOf(tankLevel)
  const anchor = vehicleAttachPointOf(art, FUEL_TENDER_ATTACH_ID)
  if (tint === null || anchor === null) return []
  const finish = { colour: tint, ...TENDER_FINISH_MATERIAL }
  return [badgeAt(FUEL_TANK_LINE, finish, pips, anchor.atM, body)]
}
