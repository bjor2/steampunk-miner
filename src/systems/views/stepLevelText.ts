/**
 * A stored step as the Upgrade bay prints it (#180 section 3): the major level, then the pips
 * toward the next one, "13" or "13 · 4/9". The plaques and their rivet rows are #177's.
 */
import type { UpgradeId } from '../economy/economyDefinition'
import { isPerPurchaseTrack, majorOf, minorsPerMajor, pipOf } from '../economy/upgradeSteps'

export function stepLevelText(step: number): string {
  const pip = pipOf(step)
  if (pip === 0) return String(majorOf(step))
  return `${majorOf(step)} · ${pip}/${minorsPerMajor() - 1}`
}

/**
 * A track's stored step in its own levels: the purchases of a per-purchase track (drill power
 * since #552), else the major and pips. Read as majors, drill purchase 12 printed "1 · 2/9".
 */
export function trackStepText(upgradeId: UpgradeId, step: number): string {
  return isPerPurchaseTrack(upgradeId) ? String(step) : stepLevelText(step)
}
