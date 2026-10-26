/**
 * Where each part the rig keeps at its own size sits on the drawn body (ticket 666, part C of #661;
 * B3 of the GD lock on #662 Part B, folded in by the #666 ruling). Ticket 913 draws each rig's hull
 * at its collider's width and holds the turret, the coal tender (and the jump drive on it) and the
 * drill head's mount to their size, riding the body's edge from the code-side `body` anchor. A
 * mount's seat is its place told apart from the width: the share of the drawn half width it lands
 * at, how far past the drawn edge it hangs, and its drawn size over its authored one. The B3 fold
 * test holds that seat identical at every width Mark, so the mounts move by position only.
 */
import { BODY_ANCHOR_M, GUN_LOOK_FIRST_LEVELS } from '../../../../constants/scene'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { FUEL_TENDER_ATTACH_ID } from '../../../../systems/art/fuelTenderArt'
import { minorsPerMajor } from '../../../../systems/economy/upgradeSteps'
import {
  bodyWidthScaleOf,
  drawnBodyWidthOf,
  heldMountScaleOf,
  heldMountXOf,
  type RigWidth,
} from '../../../../systems/render/bodyWidthLook'
import { gunTrunnionOf } from '../../../../systems/render/gunLook'
import { vehicleAttachXOf } from '../../../../systems/render/mountedPartLook'

/** A part drawn at its own size on the rig: its mount point across the vehicle's frame, m. */
export interface HeldMount {
  id: string
  x: number
}

/** A held mount's place on the drawn body, apart from the body's width. */
export interface MountSeat {
  id: string
  /** Where the mount lands from the anchor, as a share of the drawn half width: ±1 on the edges. */
  bodyShare: number
  /** How far past the drawn edge it hangs, m; 0 on the body. */
  overhangM: number
  /** Its drawn width over its authored width: 1 for a part that keeps its size. */
  drawnSizeShare: number
}

/** The rig's drawn width and its mounts' seats, as the debug read reports them. */
export interface BodyWidthReading {
  bodyHalfSide: number
  drawnWidth: number
  seats: MountSeat[]
  /** The mounts hung off the body, by id: none while every mount is seated. */
  unseatedIds: string[]
}

/** The shipped hitch's 7 cm past the stern, with room: a mount hung further out floats. */
const SEATED_OVERHANG_MAX_M = 0.1

/** The trace's grain: a micrometre, and a billionth of a share, past float64's noise at Mark 1e6. */
const METRE_GRAIN = 1e6
const SHARE_GRAIN = 1e9

/**
 * The parts ticket 913 holds to size, by their mount points in `art`: the `auto_guns` turret's
 * trunnion at each of its looks, the coal tender's hitch (the jump drive stands on the tender, so
 * it hangs there too) and the drill head's mount on the body anchor.
 */
export function heldMountsOf(art: ArtCatalogue): HeldMount[] {
  return [
    ...turretMountsOf(art),
    { id: FUEL_TENDER_ATTACH_ID, x: vehicleAttachXOf(art, FUEL_TENDER_ATTACH_ID) },
    { id: 'drill.head', x: BODY_ANCHOR_M.x },
  ]
}

/** Where `mount` sits on the body of `rig`, drawn at its collider's width. */
export function mountSeatOf(mount: HeldMount, rig: RigWidth): MountSeat {
  const fromAnchor = heldMountXOf(mount.x, rig) - BODY_ANCHOR_M.x
  const halfDrawn = drawnBodyWidthOf(rig) / 2
  const onBody = Math.min(halfDrawn, Math.max(-halfDrawn, fromAnchor))
  return {
    id: mount.id,
    bodyShare: onBody / halfDrawn,
    overhangM: Math.abs(fromAnchor - onBody),
    drawnSizeShare: bodyWidthScaleOf(rig) * heldMountScaleOf(rig),
  }
}

/** Every mount's seat on `rig`, at the trace's grain, so two widths compare byte for byte. */
export function mountTraceOf(mounts: readonly HeldMount[], rig: RigWidth): MountSeat[] {
  return mounts.map((mount) => roundedSeatOf(mountSeatOf(mount, rig)))
}

/** What `rig`'s body is drawn at, and where each of `art`'s held mounts sits on it. */
export function bodyWidthReadingOf(art: ArtCatalogue, rig: RigWidth): BodyWidthReading {
  const seats = mountTraceOf(heldMountsOf(art), rig)
  return {
    bodyHalfSide: rig.bodyHalfSide,
    drawnWidth: drawnBodyWidthOf(rig),
    seats,
    unseatedIds: unseatedIdsOf(seats),
  }
}

/** Whether the mount stands on the drawn body, or hangs no further past its edge than a hitch. */
export function isMountSeated(seat: MountSeat): boolean {
  return seat.overhangM <= SEATED_OVERHANG_MAX_M
}

function unseatedIdsOf(seats: readonly MountSeat[]): string[] {
  return seats.filter((seat) => !isMountSeated(seat)).map((seat) => seat.id)
}

function turretMountsOf(art: ArtCatalogue): HeldMount[] {
  return GUN_LOOK_FIRST_LEVELS.map((major, index) => ({
    id: `auto_guns.look-${index + 1}`,
    x: gunTrunnionOf(art, major * minorsPerMajor())[0],
  }))
}

function roundedSeatOf(seat: MountSeat): MountSeat {
  return {
    id: seat.id,
    bodyShare: Math.round(seat.bodyShare * SHARE_GRAIN) / SHARE_GRAIN,
    overhangM: Math.round(seat.overhangM * METRE_GRAIN) / METRE_GRAIN,
    drawnSizeShare: Math.round(seat.drawnSizeShare * SHARE_GRAIN) / SHARE_GRAIN,
  }
}
