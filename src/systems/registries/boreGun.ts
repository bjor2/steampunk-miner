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
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface BoreGunStats {
  /** Cells the line reaches past the rig's own tile, open or not. */
  rangeCells: number
  /** Ticks between one cell opening and the next (2 on #309). */
  openIntervalTicks: number
  /** Ticks from a shot until the next is accepted. */
  cooldownTicks: number
  /** The share of drill power the bore digs at, in basis points (`gunFactor`). */
  gunFactorBp: number
  /** Ticks of the shared dig function one shot may spend (`shotBoreBudget`). */
  boreBudgetTicks: number
  /** Energy per opened cell, as basis points of the drill's dig energy for that cell. */
  energyPerCellBp: number
  /** Ticks the bored line stands, after its last cell, before its blocks are checked. */
  collapseHoldTicks: number
}

export interface BoreGunProvider {
  id: string
  /** The gun this player fires now, or null when it has none. */
  boreGunOf(state: AuthorityState, playerId: string): BoreGunStats | null
}

export const BORE_GUN_REGISTRY = defineOneProviderRegistry<BoreGunProvider>('boreGun')

/** Basis points of a whole. */
export const WHOLE_BP = 10000

/** The provider's answer held to the drill law; null with no provider or no gun. */
export function boreGunOf(state: AuthorityState, playerId: string): BoreGunStats | null {
  const [provider] = entriesOf(BORE_GUN_REGISTRY)
  const stats = provider?.boreGunOf(state, playerId) ?? null
  return stats === null ? null : heldToDrillLaw(stats)
}

function heldToDrillLaw(stats: BoreGunStats): BoreGunStats {
  return {
    rangeCells: wholeAtLeast(stats.rangeCells, 1),
    openIntervalTicks: wholeAtLeast(stats.openIntervalTicks, 1),
    cooldownTicks: wholeAtLeast(stats.cooldownTicks, 1),
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
