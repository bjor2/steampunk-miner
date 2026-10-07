/**
 * What the Upgrade bay's live vehicle preview shows (#37, #44, the Casing ruling on #54).
 *
 * - The vehicle at the visual tier it owns. Its shape changes only at tiers 2 and 3 (#7); the
 *   levels between show as ticks on a brass gauge towards the next tier.
 * - With a track's row focused: that track's part is highlighted, the gauge shows the pending tick,
 *   the stats read before and after, and when the buy would cross a tier the next tier stands over
 *   the vehicle as a ghost. `visualTier` is then the tier after the buy (#37 acceptance 3).
 * - With the Casing row focused: a lining swatch of the next casing grade. Casing is not a vehicle
 *   track and never counts toward the tier sum, so the vehicle, gauge and tier stay as they are.
 * - After `upgrade_purchased`, the bought track's part installs (`installing`, 0.4 s, none with
 *   "reduce motion"); the timing is the screen's, the track comes in through the bay's UI state.
 *
 * Focus and installing are UI state: reading this never touches the authority or the digest.
 */
import type { UpgradeId } from '../economy/economyDefinition'
import { isMajorStep } from '../economy/upgradeSteps'
import {
  visualTier,
  visualTierGaugeOf,
  type UpgradeLevels,
  type VisualTierGauge,
} from '../economy/vehicleStats'
import type { StatPreview, WorkshopRow } from './workshopRows'

export interface PreviewGauge extends VisualTierGauge {
  /** 1 while a focused track's buy is its big level-up: the major tick it adds (#180). */
  pending: number
}

export interface PreviewEffect {
  before: StatPreview
  after: StatPreview
}

export interface UpgradePreview {
  /** The track the focused row would raise; null for the Casing row and every other control. */
  highlight: UpgradeId | null
  /** The visual tier after the focused track's purchase; the owned tier otherwise. */
  visualTier: number
  /** The visual tier the vehicle has now, the shape the preview draws solid. */
  ownedTier: number
  /** The next tier, drawn as a ghost, when the focused buy crosses into it; null otherwise. */
  ghostTier: number | null
  gauge: PreviewGauge
  /** The focused track's stats before and after the buy (#44 stat bars). */
  effect: PreviewEffect | null
  /** The casing grade the next Casing buy gives, while the Casing row is focused. */
  liningGrade: number | null
  /** The track whose part is bolting on after a purchase; null when none is. */
  installing: UpgradeId | null
}

/** The bay's controls the preview reacts to, by the id of their Buy button. */
export interface PreviewFocus {
  focusedId: string
  tracks: readonly WorkshopRow[]
  casingBuyId: string
  casingGradeAfter: number
  installing: UpgradeId | null
}

export function upgradePreviewOf(levels: UpgradeLevels, focus: PreviewFocus): UpgradePreview {
  const focused = focus.tracks.find((row) => row.buy.id === focus.focusedId) ?? null
  const ownedTier = visualTier(levels)
  const tierAfter = focused === null ? ownedTier : visualTier(levelsAfterBuy(levels, focused))
  return {
    highlight: focused?.upgradeId ?? null,
    visualTier: tierAfter,
    ownedTier,
    ghostTier: tierAfter > ownedTier ? tierAfter : null,
    gauge: { ...visualTierGaugeOf(levels), pending: pendingTicksOf(levels, focused) },
    effect: focused === null ? null : { before: focused.effectBefore, after: focused.effectAfter },
    liningGrade: focus.focusedId === focus.casingBuyId ? focus.casingGradeAfter : null,
    installing: focus.installing,
  }
}

/** One brass tick of the gauge: a level owned, the focused buy's level, or one still to buy. */
export type GaugeTick = 'owned' | 'pending' | 'open'

/**
 * The gauge's ticks from the current tier to the next. The last tier has no next shape and its
 * levels never end (#7), so it has no ticks; the screen says the levels owned in words.
 */
export function gaugeTicksOf(gauge: PreviewGauge): GaugeTick[] {
  return Array.from({ length: gauge.span ?? 0 }, (_, at) => tickAt(gauge, at))
}

function tickAt(gauge: PreviewGauge, at: number): GaugeTick {
  if (at < gauge.owned) return 'owned'
  return at < gauge.owned + gauge.pending ? 'pending' : 'open'
}

/** A tick is a major level: only the focused track's big level-up adds one. */
function pendingTicksOf(levels: UpgradeLevels, focused: WorkshopRow | null): number {
  return focused !== null && isMajorStep(levels[focused.upgradeId]) ? 1 : 0
}

function levelsAfterBuy(levels: UpgradeLevels, row: WorkshopRow): UpgradeLevels {
  return { ...levels, [row.upgradeId]: levels[row.upgradeId] + 1 }
}
