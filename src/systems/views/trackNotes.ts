/**
 * What the Upgrade bay says about a track beyond its stat preview (ticket 553): the level text and
 * a muted note under it. No track has a max level (HS and VS on #551), so a purchase that buys
 * nothing yet is still sold, and the card says why instead of hiding it:
 *   - the engine shows the ratio of its top speed to k times the drill's cut speed in the planet's
 *     hardest band (#418's band), and the HS sentence while its next purchase is worth zero;
 *   - the hold always shows its real number, "Hold: N ore (+X%)", and the Game Director's muted
 *     line once it carries more than the planet's largest band (Systems: about 0.326 R units).
 */
import type { AuthorityState } from '../authority/authorityState'
import { planetParamsOf } from '../authority/planetOfState'
import { engineParityRatioAt, isEngineStepWorthZero } from '../authority/travelSpeed'
import { formatPercent } from '../displayAmount'
import { ECONOMY } from '../economy/economy'
import type { UpgradeId } from '../economy/economyDefinition'
import { largestBandOreUnits } from '../economy/planetEconomy'
import { cargoCapacityAtStep, type UpgradeLevels } from '../economy/vehicleStats'
import { div, fromSafeInteger, sub, toFixedText, type Money } from '../money'
import { stepLevelText } from './stepLevelText'

/** The Game Director's muted line on a hold past the planet's largest band (ticket 553). */
export const HOLD_PAST_LARGEST_BAND_TEXT =
  'More than this planet holds. Pays off on deeper planets.'

/** The short state beside the engine's level while its next purchase buys no travel speed. */
export const ENGINE_WORTH_ZERO_TEXT = 'worth zero'

/** The HS sentence under a worth-zero engine purchase (ticket 553 body), k read from the data. */
export function engineWorthZeroNote(): string {
  return (
    "No extra speed until your drill's cut speed is within reach of the engine's top speed " +
    `(needs the engine above ${parityKText()}× the drill's cut speed). Raises your top speed ` +
    'once it is.'
  )
}

/** "top speed 0.62× of 1.5× cut": `speedMax / (k * cutSpeed)` in the hardest band. */
export function engineParityText(ratio: number): string {
  return `top speed ${ratioText(ratio)}× of ${parityKText()}× cut`
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

/** The track's level text: its step, with the engine's parity or the hold's units beside it. */
export function trackLevelTextOf(
  state: AuthorityState,
  playerId: string,
  levels: UpgradeLevels,
  upgradeId: UpgradeId,
): string {
  const text = stepLevelText(levels[upgradeId])
  if (upgradeId === 'engine') return withEngineParity(state, playerId, text)
  if (upgradeId === 'cargo_hold') return `${text} · ${holdText(levels.cargo_hold)}`
  return text
}

/** The muted line under the track, or null: the worth-zero engine, the hold past a band's ore. */
export function trackNoteOf(
  state: AuthorityState,
  playerId: string,
  levels: UpgradeLevels,
  upgradeId: UpgradeId,
): string | null {
  if (upgradeId === 'engine' && isEngineStepWorthZero(state, playerId)) {
    return engineWorthZeroNote()
  }
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

/** The step text, the parity ratio where the drill cuts the hardest band, and a worth-zero step. */
function withEngineParity(state: AuthorityState, playerId: string, text: string): string {
  const ratio = engineParityRatioAt(state, playerId)
  const parts = ratio === null ? [text] : [text, engineParityText(ratio)]
  if (isEngineStepWorthZero(state, playerId)) parts.push(ENGINE_WORTH_ZERO_TEXT)
  return parts.join(' · ')
}

/** Two decimals, and "<0.01" under them, so a far-outrun engine never reads a flat 0. */
function ratioText(ratio: number): string {
  return ratio < SMALLEST_SHOWN_RATIO ? `<${SMALLEST_SHOWN_RATIO}` : ratio.toFixed(2)
}

const SMALLEST_SHOWN_RATIO = 0.01

/** k as plain decimals, "1.5", with no trailing zeros. */
function parityKText(): string {
  return toFixedText(ECONOMY.drill.travelParityK, 2).replace(/\.?0+$/, '')
}
