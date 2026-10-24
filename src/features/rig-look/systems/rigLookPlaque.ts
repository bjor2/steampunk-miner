/**
 * The upgrade plaque's fitting fact, the Outfitter card's hover line (TD ruling on #579, folded
 * into ticket 585; Progression on #647 for ticket 809): a track whose look rows carry a plaque
 * template names the band the player owns, `Fitting: {bandName}`, from data of 3 words at most:
 * the authored step's card, or past the art the finish the band wears. Past the art it adds the
 * exact owned level through the shared formatter's long mode (#681), ` · L1,000,000`, so the copy
 * never runs out and two bands of one finish still read apart. A count below the first edge names
 * nothing: the plaque never names a band the player does not own.
 */
import { formatAmountLong } from '../../../systems/displayAmount'
import { lookFrameAt, type TrackLookFrames } from './render/rigLookFrames'
import { lookPurchasesOf, rigLookIndexOf, type TrackLookRows } from './render/rigLookIndex'

const BAND_NAME = '{bandName}'
const LEVEL = '{level}'

/** The fitting fact `n` owned purchases show on the plaque; null with no template or no band. */
export function plaqueFactOf(frames: TrackLookFrames, n: number): string | null {
  const { plaque } = frames.rows
  const bandName = lookFrameAt(frames, n).bandName
  if (plaque === undefined || bandName === null) return null
  const { tail } = rigLookIndexOf(frames.rows, n)
  const template = tail === 0 ? plaque.step : plaque.tail
  return template.replace(BAND_NAME, bandName).replace(LEVEL, levelTextOf(n))
}

/** The owned level in full, grouped (`1,000,000`), as the hover's long mode prints a count. */
export function levelTextOf(n: number): string {
  return formatAmountLong(lookPurchasesOf(n))
}

/** Why a plaque template cannot load: its placeholders each once, and every step named. */
export function plaqueProblemsOf(rows: TrackLookRows): string[] {
  if (rows.plaque === undefined) return []
  return [
    ...placeholderProblemsOf('plaque step', rows.plaque.step, [BAND_NAME], [LEVEL]),
    ...placeholderProblemsOf('plaque tail', rows.plaque.tail, [BAND_NAME, LEVEL], []),
    ...unnamedStepProblemsOf(rows),
  ]
}

function placeholderProblemsOf(
  name: string,
  template: string,
  needed: readonly string[],
  refused: readonly string[],
): string[] {
  const missing = needed.filter((placeholder) => !isShownOnce(template, placeholder))
  const extra = refused.filter((placeholder) => template.includes(placeholder))
  return [
    ...missing.map((placeholder) => `${name} needs ${placeholder} once`),
    ...extra.map((placeholder) => `${name} may not show ${placeholder}`),
  ]
}

function isShownOnce(template: string, placeholder: string): boolean {
  return template.split(placeholder).length === 2
}

function unnamedStepProblemsOf(rows: TrackLookRows): string[] {
  const unnamed = rows.steps.filter((step) => step.card === null)
  return unnamed.map((step) => `step from ${step.from}: no card for the plaque`)
}
