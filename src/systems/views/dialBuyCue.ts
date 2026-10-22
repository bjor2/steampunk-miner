/**
 * The per-buy cue on the gauge cluster (spec #678, ticket 727; G&V's gap list, 22 Oct): a small
 * notch on a dial's rim that steps one place for every upgrade bought on that dial's counts (the
 * table's `buyCue`), so even a +1 buy shows on the strip, on the render the bought level reaches.
 * It reads only what the rig owns, never a next level, so it previews nothing; it is a view of the
 * levels, never an event, so it cannot start the #718 reveal (HS: stat buys add no part or
 * reveal), and it changes no economy number (VS). The place is the summed count modulo the
 * table's notches, so it keeps moving past any level. A dial folded into the overflow count hands
 * its cue to the "+N" cell, so a buy never goes unseen on a phone's narrow surface strip. Pure.
 */
import type { VehicleState } from '../vehicle/vehicleState'
import { CASING_COUNT, GAUGE_CLUSTER, type DialBuyCue } from './gaugeClusterTable'

/** The owned count of each thing an upgrade buy raises: the six tracks and the casing grade. */
export type UpgradeCounts = Readonly<Record<string, number>>

/** Where the cue sits: its notch, 0 to notches - 1, and that place over the dial's sweep, 0..1000. */
export interface BuyCueMark {
  notch: number
  permille: number
}

const PERMILLE = 1000

export function upgradeCountsOf(vehicle: VehicleState): UpgradeCounts {
  return { ...vehicle.levels, [CASING_COUNT]: vehicle.casingGrade }
}

/** The cue of these dials together; null when the table lists no count under any of them. */
export function buyCueOfDials(
  dialIds: readonly string[],
  counts: UpgradeCounts,
  cue: DialBuyCue = GAUGE_CLUSTER.buyCue,
): BuyCueMark | null {
  const listed = dialIds.flatMap((dialId) => cue.counts[dialId] ?? [])
  if (listed.length === 0) return null
  return buyCueMarkAt(summedCountOf(listed, counts) % cue.notches, cue.notches)
}

function summedCountOf(listed: readonly string[], counts: UpgradeCounts): number {
  return listed.reduce((sum, count) => sum + (counts[count] ?? 0), 0)
}

function buyCueMarkAt(notch: number, notches: number): BuyCueMark {
  return { notch, permille: Math.floor((notch * PERMILLE) / notches) }
}
