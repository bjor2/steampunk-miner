/**
 * Who may claim a vehicle-attach point and a hidden `vehicle` slot in the rig look table (#577,
 * ticket 640; the drill head's declared exception, ticket 623, GD lock of 25 Oct and TD ruling
 * 6402023994 on #623). A track's point is its own vehicle-attach point, never a module's or a
 * wagon's, and each point and each hidden slot has one owner. The one exception is a point the
 * table names in `sharedSlots`: the item tracks there take turns by row order, ahead of at most one
 * upgrade track whose level look stays on as their tint, and they may all hide the same slot.
 */
import { isVehiclePartId } from '../../../systems/art/artIds'
import { isAttachId } from '../../../systems/registries/vehicleAttach'

/**
 * The five aetheric module points (TD lock on #265, ticket 376), the wagon hitch (`hull.hitch`,
 * TD after the Horizontal Scaler review on #162) and the bore gun's point (`hull.front`, ticket
 * 315), where every bought `bore_gun` module rides the gun (ticket 321): a rig-look part never
 * takes one (HS on #577, which names the bore_gun mounts). `hull.turret` stays open: it is the
 * `combat` line's own showcase point (#588), and a fitted `auto_guns` module wins it at run time,
 * since the turret's modules list their parts there (ticket 589).
 */
export const MODULE_ATTACH_POINTS: readonly string[] = [
  'hull.nose',
  'hull.roof.coils',
  'hull.tail',
  'hull.flank',
  'hull.stack.side',
  'hull.hitch',
  'hull.front',
]

/** One track's claim: its point and the `vehicle` slot it hides, upgrade tracks first. */
export interface PointClaim {
  track: string
  slot: string
  replaces?: string
  isItemTrack: boolean
}

/** Why a track cannot take `slot`; empty when it is a free vehicle-attach point. */
export function slotProblemsOf(slot: string): string[] {
  const problems: string[] = []
  if (!isAttachId(slot)) problems.push(`slot ${slot} is not a vehicle-attach point`)
  if (MODULE_ATTACH_POINTS.includes(slot)) problems.push(`slot ${slot} is a module or wagon point`)
  return problems
}

export function replacedSlotProblemsOf(replaces: string | undefined): string[] {
  if (replaces === undefined || isVehiclePartId(`t1-${replaces}`)) return []
  return [`replaces ${replaces}, which is not a vehicle part slot`]
}

/** Every second claim on a point or a hidden slot outside the declared shared points. */
export function pointClaimProblemsOf(
  claims: readonly PointClaim[],
  sharedSlots: readonly string[],
): string[] {
  return [
    ...claims.flatMap((claim, at) => pointProblemsOf(claims, sharedSlots, claim, at)),
    ...claims.flatMap((claim, at) => hiddenSlotProblemsOf(claims, sharedSlots, claim, at)),
    ...sharedSlots.flatMap((slot) => sharedSlotProblemsOf(claims, slot)),
  ]
}

function pointProblemsOf(
  claims: readonly PointClaim[],
  sharedSlots: readonly string[],
  claim: PointClaim,
  at: number,
): string[] {
  if (!sharedSlots.includes(claim.slot)) {
    return isSecondOn(claims, claim, at, () => true) ? [anotherTracksPoint(claim)] : []
  }
  if (claim.isItemTrack) return []
  const isSecondUpgrade = isSecondOn(claims, claim, at, (other) => !other.isItemTrack)
  return isSecondUpgrade ? [`${claim.track}: slot ${claim.slot} has another upgrade track`] : []
}

/** Two looks never stand in one part, but on a shared point, where only one shows at a time. */
function hiddenSlotProblemsOf(
  claims: readonly PointClaim[],
  sharedSlots: readonly string[],
  claim: PointClaim,
  at: number,
): string[] {
  if (claim.replaces === undefined) return []
  const firstAt = claims.findIndex((other) => other.replaces === claim.replaces)
  const first = claims[firstAt]
  if (firstAt === at || isSharingPoint(sharedSlots, first, claim)) return []
  return [`${claim.track}: replaces ${claim.replaces}, another track's`]
}

/** A declared shared point is a vehicle-attach point at least two tracks claim. */
function sharedSlotProblemsOf(claims: readonly PointClaim[], slot: string): string[] {
  const claimed = claims.filter((claim) => claim.slot === slot).length
  if (claimed >= 2) return []
  return [`shared slot ${slot} is claimed by ${claimed} tracks, not two or more`]
}

function isSecondOn(
  claims: readonly PointClaim[],
  claim: PointClaim,
  at: number,
  isCounted: (other: PointClaim) => boolean,
): boolean {
  return claims.findIndex((other) => other.slot === claim.slot && isCounted(other)) !== at
}

function isSharingPoint(sharedSlots: readonly string[], a: PointClaim, b: PointClaim): boolean {
  return a.slot === b.slot && sharedSlots.includes(a.slot)
}

function anotherTracksPoint(claim: PointClaim): string {
  return `${claim.track}: slot ${claim.slot} is another track's`
}
