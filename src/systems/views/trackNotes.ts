/**
 * What the Upgrade bay says about a track beyond its stat preview (ticket 553): the level text and
 * a muted note under it. No track has a max level (HS and VS on #551), so a purchase that buys
 * nothing yet is still sold, and the card says why instead of hiding it:
 *   - the drill power card says which cuts something other than the drill caps, generated from the
 *     same table the motion rule reads (`cutAxisCaps.ts`, Bjor's ruling on #723): "Sideways capped
 *     by drive speed.";
 *   - the hold always shows its real number, "Hold: N ore (+X%)", and the Game Director's muted
 *     line once it carries more than the planet's largest band (Systems: about 0.326 R units).
 * The engine is a plain price-only line again: with travel parity retired (#723) the drill never
 * sets the drive's speed, so every engine purchase buys speed.
 */
import type { AuthorityState } from '../authority/authorityState'
import { planetParamsOf } from '../authority/planetOfState'
import { formatPercent } from '../displayAmount'
import type { UpgradeId } from '../economy/economyDefinition'
import { largestBandOreUnits } from '../economy/planetEconomy'
import { cargoCapacityAtStep, type UpgradeLevels } from '../economy/vehicleStats'
import { div, fromSafeInteger, sub, type Money } from '../money'
import { cutCapLines } from '../vehicle/cutAxisCaps'
import { stepLevelText } from './stepLevelText'

/** The Game Director's muted line on a hold past the planet's largest band (ticket 553). */
export const HOLD_PAST_LARGEST_BAND_TEXT =
  'More than this planet holds. Pays off on deeper planets.'

/** The drill card's line from the cut caps: "Sideways capped by drive speed." (ticket 723). */
export function drillCutCapNote(): string {
  return cutCapLines()
    .map((line) => `${line}.`)
    .join(' ')
}

/** "Hold: 81 ore (+11.1%)": the hold's units now and what the next purchase adds. */
export function holdText(step: number): string {
  const now = cargoCapacityAtStep(step)
  const gain = shareGainedOf(now, cargoCapacityAtStep(step + 1))
  return `Hold: ${now} ore (+${formatPercent(gain)})`
}

/** `(next - now) / now` of two whole counts, in Money. */
function shareGainedOf(now: number, next: number): Money {
  return div(sub(fromSafeInteger(next), fromSafeInteger(now)), fromSafeInteger(now))
}

/** The track's level text: its step, with the hold's units beside it. */
export function trackLevelTextOf(levels: UpgradeLevels, upgradeId: UpgradeId): string {
  const text = stepLevelText(levels[upgradeId])
  if (upgradeId === 'cargo_hold') return `${text} · ${holdText(levels.cargo_hold)}`
  return text
}

/** The muted line under the track, or null: the drill's cut caps, the hold past a band's ore. */
export function trackNoteOf(
  state: AuthorityState,
  levels: UpgradeLevels,
  upgradeId: UpgradeId,
): string | null {
  if (upgradeId === 'drill_power') return drillCutCapNote()
  if (upgradeId === 'cargo_hold' && isHoldPastLargestBand(state, levels.cargo_hold)) {
    return HOLD_PAST_LARGEST_BAND_TEXT
  }
  return null
}

/** Whether the hold carries more than the planet's largest band of ore; never off a planet. */
export function isHoldPastLargestBand(state: AuthorityState, holdStep: number): boolean {
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  return cargoCapacityAtStep(holdStep) > largestBandOreUnits(params.radiusTiles)
}
