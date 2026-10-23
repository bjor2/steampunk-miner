/**
 * The nominal shares of one band trip (ticket 449): a hold filled in the band, each ore unit drawn
 * at the painted weights, so a cell's share of the trip is its part of the band's value. Systems'
 * family-first rule (6226198316 on ticket 446) splits a painted (tier, family) cell equally among
 * the roster kinds live on it, by their draw weights where these differ (ticket 713: P1's gems draw
 * 4:3:2 against the default 3, `slotDraws.ts`):
 *
 *   share(kind) = tierShare x familyShare x valueRatio^k / mean x weight(kind) / sum of live weights
 *
 * A gem kind's share is valued at its cell's rarity tier here, as every kind is; what the gems are
 * worth at their own tiers is the ore value census's (the 15% pool cap on #713).
 *
 * and its constructive guard asks every painted cell for `max(1, ceil(weightBp / boundBp))` live
 * kinds, so no cell is bare and no kind can pass its bound. A signature shares its cell with the
 * lead entry of its family and tier, as the roster fold draws it, but is a tier of its own in the
 * tier shares (Systems 6203133480 section 1: "signature in b4 640"). A cell the signature paints
 * alone (the relic signature from P3) is the slotless 16th material, so the guard asks it for no
 * kind (E1, Systems and TD on #453). Whole basis points, rounded up.
 */
import { isTripClamped, ORE_ROWS, rarityTiers } from '../../ores'
import { cellValueOf, type PaintedBand, type PaintedCell } from './paintedPlanet'
import type { RarityShareBounds } from './shareRows'

const BASIS_POINTS = 10000
/** A share is cut to a thousandth of a basis point before it is rounded up: float noise never rounds up. */
const THOUSANDTHS = 1000
export const SIGNATURE_TIER_ID = 'signature'

/** One roster kind's share of the band trip. */
export interface KindShare {
  slotId: string
  isCommon: boolean
  /** Its share as a fraction of the trip, unrounded: the planet share weighs these. */
  tripShare: number
  bandTripBp: number
}

export interface TierShare {
  /** A non-common rarity tier id, or `signature`. */
  tierId: string
  bandTripBp: number
}

/** A painted (tier, family) cell with fewer live kinds than the guard asks. */
export interface ShortCell {
  family: string
  lead: number
  weightBp: number
  liveKinds: number
  neededKinds: number
}

export interface BandShares {
  band: number
  /** Every non-common tier painted in the band, signature included. */
  tiers: readonly TierShare[]
  /** Epic and mythic together, the tiers the trip clamp holds, before any clamp. */
  epicAndMythicBp: number
  kinds: readonly KindShare[]
  shortCells: readonly ShortCell[]
  /** Distinct common kinds live in the band. */
  liveCommons: number
}

/** A (tier, family) cell of the band: its entries merged, as the roster fold sees a patch. */
interface KindCell {
  family: string
  lead: number
  weightBp: number
  value: number
  liveKinds: readonly string[]
  /** Painted by signature entries only: the slotless signature material, never a kind (#453 E1). */
  isSignatureOnly: boolean
}

export function bandSharesOf(band: PaintedBand, bounds: RarityShareBounds): BandShares {
  const bandValue = band.cells.reduce((sum, cell) => sum + cellValueOf(cell), 0)
  const kindCells = kindCellsOf(band.cells)
  return {
    band: band.band,
    tiers: tierSharesOf(band.cells, bandValue),
    epicAndMythicBp: wholeBasisPointsUp(epicAndMythicValueOf(band.cells) / bandValue),
    kinds: kindCells.flatMap((cell) => kindSharesOf(cell, bandValue)),
    shortCells: kindCells.flatMap((cell) => shortCellsOf(cell, bounds)),
    liveCommons: new Set(kindCells.filter(isCommonCell).flatMap((cell) => cell.liveKinds)).size,
  }
}

/** A fraction in whole basis points, rounded up once cut to a thousandth of one. */
export function wholeBasisPointsUp(fraction: number): number {
  return Math.ceil(Math.round(fraction * BASIS_POINTS * THOUSANDTHS) / THOUSANDTHS)
}

/** The bound a kind on this cell is held to: a common's band-trip bound or any other kind's. */
export function kindBoundBpOf(lead: number, bounds: RarityShareBounds): number {
  return lead === 0 ? bounds.perCommonKindMaxOfBandTrip : bounds.perNonCommonKindMax
}

function tierSharesOf(cells: readonly PaintedCell[], bandValue: number): TierShare[] {
  const values = new Map<string, number>()
  for (const cell of cells.filter((each) => each.isSignature || each.lead > 0)) {
    const tierId = tierIdOf(cell)
    values.set(tierId, (values.get(tierId) ?? 0) + cellValueOf(cell))
  }
  return [...values].map(([tierId, value]) => ({
    tierId,
    bandTripBp: wholeBasisPointsUp(value / bandValue),
  }))
}

function tierIdOf(cell: PaintedCell): string {
  return cell.isSignature ? SIGNATURE_TIER_ID : rarityTiers()[cell.lead].id
}

function epicAndMythicValueOf(cells: readonly PaintedCell[]): number {
  return cells
    .filter((cell) => !cell.isSignature && isTripClamped(cell.lead))
    .reduce((sum, cell) => sum + cellValueOf(cell), 0)
}

function kindCellsOf(cells: readonly PaintedCell[]): KindCell[] {
  const merged = new Map<string, KindCell>()
  for (const cell of cells) {
    const key = `${cell.family}:${cell.lead}`
    const kept = merged.get(key)
    merged.set(key, {
      family: cell.family,
      lead: cell.lead,
      weightBp: (kept?.weightBp ?? 0) + cell.weightBp,
      value: (kept?.value ?? 0) + cellValueOf(cell),
      liveKinds: cell.liveKinds,
      isSignatureOnly: (kept?.isSignatureOnly ?? true) && cell.isSignature,
    })
  }
  return [...merged.values()]
}

function kindSharesOf(cell: KindCell, bandValue: number): KindShare[] {
  const weights = cell.liveKinds.map(drawWeightOfSlot)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  return cell.liveKinds.map((slotId, at) => {
    const tripShare = cell.value / bandValue / (totalWeight / weights[at])
    return {
      slotId,
      isCommon: isCommonCell(cell),
      tripShare,
      bandTripBp: wholeBasisPointsUp(tripShare),
    }
  })
}

/** The slot's weight in the roster draw: its own, else the default (ticket 713). */
function drawWeightOfSlot(slotId: string): number {
  const tables = Object.values(ORE_ROWS.kinds.slotsByTable)
  const slot = tables.flat().find((each) => each.slotId === slotId)
  return slot?.drawWeight ?? ORE_ROWS.kinds.drawWeightDefault
}

function shortCellsOf(cell: KindCell, bounds: RarityShareBounds): ShortCell[] {
  if (cell.isSignatureOnly) return []
  const neededKinds = Math.max(1, Math.ceil(cell.weightBp / kindBoundBpOf(cell.lead, bounds)))
  if (cell.liveKinds.length >= neededKinds) return []
  const { family, lead, weightBp } = cell
  return [{ family, lead, weightBp, liveKinds: cell.liveKinds.length, neededKinds }]
}

function isCommonCell(cell: { lead: number }): boolean {
  return cell.lead === 0
}
