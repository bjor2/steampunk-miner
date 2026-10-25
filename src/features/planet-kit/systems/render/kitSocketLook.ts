/**
 * What a kit socket draws on the rig (ticket 825, for G&V's sockets on ticket 823): the socket
 * asset's quads at the base vehicle's attach point (K5: no offset in code), each part at its pose,
 * the flasks up to the held count and the shard only while the tongs act. The same rule places the
 * review renders, and the outline check reads it against the vehicle sidecar: nothing a socket
 * draws leaves the rig's bounds or passes the drawn drill tip (#789, the G&V guard). Render-only.
 */
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { slotOfPartId } from '../../../../systems/art/artIds'
import type { AssetQuad } from '../../../../systems/art/assetLook'
import type { Pair, PartsSidecar, SidecarPart } from '../../../../systems/art/partsSidecar'
import { partsShownAtTier } from '../../../../systems/art/placeholderLook'
import { mountedPartQuadsOf } from '../../../../systems/render/mountedPartLook'
import { kitSocketPoseOf, type KitSocket, type KitSocketPart } from '../kitSockets'

/** What of a socket shows now: the flasks held and whether the tool acts (#850 sets both). */
export interface KitSocketShow {
  heldFlasks: number
  isActing: boolean
}

/** Nothing held, nothing acting: a tool at rest on the rig. */
export const KIT_SOCKET_AT_REST: KitSocketShow = { heldFlasks: 0, isActing: false }

/** Everything a socket can show: every flask, the shard, the acting pose. */
export const KIT_SOCKET_ALL_SHOWN: KitSocketShow = { heldFlasks: 3, isActing: true }

/** A quad in the vehicle's frame with the turn its group applies about `pivot`. */
export interface KitSocketQuad extends AssetQuad {
  turn: number
}

/** `[left, bottom, right, top]` in metres of the vehicle's frame. */
export type FrameBox = readonly [number, number, number, number]

/** The vehicle's part slot the drawn drill tip is: the frontmost of the rig (#789). */
const DRILL_TIP_SLOT = 'drill-bit'

export function kitSocketQuadsOf(
  art: ArtCatalogue,
  socket: KitSocket,
  show: KitSocketShow,
): KitSocketQuad[] {
  const mounted = mountedPartQuadsOf(art, { assetId: socket.assetId, attachId: socket.attach })
  return mounted.flatMap((quad) => shownQuadOf(socket, quad, show))
}

/** The box the quad covers once turned about its pivot. */
export function kitSocketQuadBoxOf(quad: KitSocketQuad): FrameBox {
  const corners = cornersOf(quad).map((corner) => turnedAbout(corner, quad.pivot, quad.turn))
  return boxAround(corners)
}

/** The box round every part the rig shows at `tier`: what a socket part must stay inside. */
export function rigBoundsOf(vehicle: PartsSidecar, tier: number): FrameBox {
  const boxes = partsShownAtTier(vehicle.parts, tier).map(partBoxOf)
  return boxes.reduce(unionOf)
}

/** The right edge of the drawn drill tip at `tier`: a socket part stays behind it. */
export function drillTipFrontOf(vehicle: PartsSidecar, tier: number): number {
  const tips = partsShownAtTier(vehicle.parts, tier).filter(
    (part) => slotOfPartId(part.id) === DRILL_TIP_SLOT,
  )
  return Math.max(...tips.map((part) => partBoxOf(part)[2]))
}

export function isBoxInside(inner: FrameBox, outer: FrameBox, toleranceM: number): boolean {
  return (
    inner[0] >= outer[0] - toleranceM &&
    inner[1] >= outer[1] - toleranceM &&
    inner[2] <= outer[2] + toleranceM &&
    inner[3] <= outer[3] + toleranceM
  )
}

function shownQuadOf(socket: KitSocket, quad: AssetQuad, show: KitSocketShow): KitSocketQuad[] {
  const part = socket.parts.find((candidate) => candidate.id === quad.partId)
  if (part === undefined || !isPartShown(part, show)) return []
  const pose = kitSocketPoseOf(part, show.isActing)
  return [{ ...movedBy(quad, pose.shift), turn: pose.turn }]
}

function isPartShown(part: KitSocketPart, show: KitSocketShow): boolean {
  if (part.shownFromHeld !== undefined && show.heldFlasks < part.shownFromHeld) return false
  return part.shownWhileActing !== true || show.isActing
}

function movedBy(quad: AssetQuad, by: Pair): AssetQuad {
  return { ...quad, centre: shifted(quad.centre, by), pivot: shifted(quad.pivot, by) }
}

function shifted([x, y]: Pair, [dx, dy]: Pair): Pair {
  return [x + dx, y + dy]
}

function partBoxOf(part: SidecarPart): FrameBox {
  const left = part.atM[0] - part.pivotM[0]
  const bottom = part.atM[1] - part.pivotM[1]
  return [left, bottom, left + part.sizeM[0], bottom + part.sizeM[1]]
}

function cornersOf(quad: AssetQuad): Pair[] {
  const [cx, cy] = quad.centre
  const [halfWidth, halfHeight] = [quad.size[0] / 2, quad.size[1] / 2]
  return [
    [cx - halfWidth, cy - halfHeight],
    [cx + halfWidth, cy - halfHeight],
    [cx + halfWidth, cy + halfHeight],
    [cx - halfWidth, cy + halfHeight],
  ]
}

function turnedAbout([x, y]: Pair, [px, py]: Pair, turn: number): Pair {
  const dx = x - px
  const dy = y - py
  return [
    px + dx * Math.cos(turn) - dy * Math.sin(turn),
    py + dx * Math.sin(turn) + dy * Math.cos(turn),
  ]
}

function boxAround(points: readonly Pair[]): FrameBox {
  return [
    Math.min(...points.map(([x]) => x)),
    Math.min(...points.map(([, y]) => y)),
    Math.max(...points.map(([x]) => x)),
    Math.max(...points.map(([, y]) => y)),
  ]
}

function unionOf(a: FrameBox, b: FrameBox): FrameBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}
