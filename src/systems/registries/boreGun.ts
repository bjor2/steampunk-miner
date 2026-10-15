/**
 * The bore gun's numbers for one player (ticket 313, from the #309 GD decision and the TD's
 * split): range, cadence, penetration, energy and the collapse hold all live in the ground-gun
 * slice's data and tracks, so the kernel's `ground_gun.fire` reads them from one provider and
 * never imports the slice. With no provider, or a player without a gun, the gun is not there and
 * every fire is refused.
 *
 * The kernel holds what a provider answers to the drill law (Systems' budget on #309): the bore
 * never digs at more than the drill's own power, and a bored cell never costs less energy than
 * drilling it would; every number is whole, ticks and cells at least 1, a budget and a hold at
 * least 0.
 *
 * The recovery wait after a shot is one pure function, `gunRecoveryTicks`, here at the seam so the
 * authority and the slice's store card read the same formula (the TD on #313 and #322).
 *
 * Auto mode (ticket 317, #310) reads the steam sear's numbers from the same provider: the preview,
 * the wait after a manual shot, the energy reserve (#322's `autoShoot`) and whether the trip's
 * income cap is used up (the slice's `roomUnderCapOf`, which the kernel cannot read).
 *
 * The forced-gun bot run (ticket 347, the TD's seam 3 on #314) starts with the gun at its walls:
 * the provider names the debug command that sets it there, as only the slice knows its tracks.
 *
 * A shot's shape (ticket 377, the TD lock on #318) is the provider's too: the slice folds its
 * signature modules into one `ShotShape`, which the kernel reads once per shot and holds to the
 * caps in `authority/bore/shotShape.ts`.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface BoreGunStats {
  /** Cells the line reaches past the rig's own tile, open or not. */
  rangeCells: number
  /** Ticks between one cell opening and the next (2 on #309). */
  openIntervalTicks: number
  /** The least wait from a shot until the next is accepted, from the rate level. */
  cooldownTicks: number
  /** The rate level's `kGunPct`: a shot through rock waits its dig ticks × 100 / kGunPct. */
  kGunPct: number
  /** The share of drill power the bore digs at, in basis points (`gunFactor`). */
  gunFactorBp: number
  /** Ticks of the shared dig function one shot may spend (`shotBoreBudget`). */
  boreBudgetTicks: number
  /** Energy per opened cell, as basis points of the drill's dig energy for that cell. */
  energyPerCellBp: number
  /** Ticks the bored line stands, after its last cell, before its blocks are checked. */
  collapseHoldTicks: number
}

/** The steam sear's numbers for auto mode (ticket 317), from #322's `autoShoot` and the sear's Mark. */
export interface BoreAutoShootStats {
  previewTicks: number
  /** Ticks auto waits after a manual shot (60, the sear's Mark stat, floor 20). */
  manualWaitTicks: number
  reserveAboveRescueBp: number
  /** `roomUnderCapOf` is 0 for the gun's ore this trip: auto aim scores ore 0 and holds. */
  isIncomeCapUsed: boolean
}

/**
 * How a shot bores beyond its one aimed line (ticket 377, the TD lock on #318): every line and
 * turn spends the one `boreBudgetTicks`, so a shape only redistributes the shot's cells.
 */
export interface ShotShape {
  /**
   * Extra lines as bearing offsets from the aimed bearing, in `boreBearings.json` steps; the aimed
   * line is implicit.
   */
  lineOffsets: readonly number[]
  /** Same-ore seam turns each line may take after its first ore cell. */
  seamTurns: number
  /** The casing_cement grade's row id the shot lines the walls it opens in, or null. */
  liningGrade: string | null
  /** Energy per opened cell on top of the gun's, as basis points of the drill's dig energy. */
  extraEnergyPerCellBp: number
  /** Ticks a bored line stays grounded (#378); null for none. */
  groundTicks: number | null
  /** Ticks a strut stands at a hollow's mouth (#379); null for none. */
  strutTicks: number | null
}

export interface BoreGunProvider {
  id: string
  /** The gun this player fires now, or null when it has none. */
  boreGunOf(state: AuthorityState, playerId: string): BoreGunStats | null
  /** The sear's numbers for this player, or null (or left out) when auto mode has none. */
  autoShootOf?(state: AuthorityState, playerId: string): BoreAutoShootStats | null
  /**
   * The shape this player's next shot bores, folded over its modules; null (or left out) for one
   * line. Read once per shot, as it fires.
   */
  shotShapeOf?(state: AuthorityState, playerId: string): ShotShape | null
  /**
   * The debug command that mounts the gun with every track at its wall, free (the slice's
   * `debug.ground-gun.setLevels`): the forced bot run's start. Left out, that run has no gun.
   */
  wallsMountIntent?(): CommandIntent
}

export const BORE_GUN_REGISTRY = defineOneProviderRegistry<BoreGunProvider>('boreGun')

/** Basis points of a whole. */
export const WHOLE_BP = 10000

const PERCENT = 100

/** The rate level's two numbers, as a shot fired with them. */
export type GunRate = Pick<BoreGunStats, 'cooldownTicks' | 'kGunPct'>

/**
 * The ticks from a shot until the next is accepted (TD ruling on #313):
 * `max(minimum, cooldownTicks, ceil(spentDigTicks × 100 / kGunPct))`, where `spentDigTicks` is
 * what the shot's cells took through the drill's dig function, at the rate the shot fired with.
 * The minimum is `drill.boreRecoveryMinTicks` (GD, 14 Oct, on the #397 TD lock): with no tile
 * floor a cell can dig in one tick, and the wait still reads as a recovery.
 */
export function gunRecoveryTicks(spentDigTicks: number, rate: GunRate): number {
  const digRecovery = ceilDiv(spentDigTicks * PERCENT, rate.kGunPct)
  return Math.max(ECONOMY.drill.boreRecoveryMinTicks, rate.cooldownTicks, digRecovery)
}

/** The provider's answer held to the drill law; null with no provider or no gun. */
export function boreGunOf(state: AuthorityState, playerId: string): BoreGunStats | null {
  const [provider] = entriesOf(BORE_GUN_REGISTRY)
  const stats = provider?.boreGunOf(state, playerId) ?? null
  return stats === null ? null : heldToDrillLaw(stats)
}

/** The provider's sear numbers, whole and not negative; null with no provider or no answer. */
export function boreAutoShootOf(
  state: AuthorityState,
  playerId: string,
): BoreAutoShootStats | null {
  const [provider] = entriesOf(BORE_GUN_REGISTRY)
  const stats = provider?.autoShootOf?.(state, playerId) ?? null
  return stats === null ? null : wholeAutoShootOf(stats)
}

/** The provider's shot shape as it answered, unchecked; null with no provider or no answer. */
export function providedShotShapeOf(state: AuthorityState, playerId: string): ShotShape | null {
  const [provider] = entriesOf(BORE_GUN_REGISTRY)
  return provider?.shotShapeOf?.(state, playerId) ?? null
}

/** The provider's debug command for a gun at its walls, or null with no provider or none named. */
export function boreGunWallsMountIntent(): CommandIntent | null {
  const [provider] = entriesOf(BORE_GUN_REGISTRY)
  return provider?.wallsMountIntent?.() ?? null
}

function wholeAutoShootOf(stats: BoreAutoShootStats): BoreAutoShootStats {
  return {
    previewTicks: wholeAtLeast(stats.previewTicks, 0),
    manualWaitTicks: wholeAtLeast(stats.manualWaitTicks, 0),
    reserveAboveRescueBp: wholeAtLeast(stats.reserveAboveRescueBp, 0),
    isIncomeCapUsed: stats.isIncomeCapUsed,
  }
}

function heldToDrillLaw(stats: BoreGunStats): BoreGunStats {
  return {
    rangeCells: wholeAtLeast(stats.rangeCells, 1),
    openIntervalTicks: wholeAtLeast(stats.openIntervalTicks, 1),
    cooldownTicks: wholeAtLeast(stats.cooldownTicks, 1),
    kGunPct: wholeAtLeast(stats.kGunPct, 1),
    gunFactorBp: Math.min(WHOLE_BP, wholeAtLeast(stats.gunFactorBp, 1)),
    boreBudgetTicks: wholeAtLeast(stats.boreBudgetTicks, 0),
    energyPerCellBp: wholeAtLeast(stats.energyPerCellBp, WHOLE_BP),
    collapseHoldTicks: wholeAtLeast(stats.collapseHoldTicks, 0),
  }
}

/** Whole ticks, cells and basis points only, so a bore's numbers stay exact in the save. */
function wholeAtLeast(value: number, least: number): number {
  return Math.max(least, Math.floor(value))
}

function ceilDiv(dividend: number, divisor: number): number {
  return Math.floor((dividend + divisor - 1) / divisor)
}
