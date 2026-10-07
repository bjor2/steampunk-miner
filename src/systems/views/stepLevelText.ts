/**
 * A stored step as the Upgrade bay prints it (#180 section 3): the major level, then the pips
 * toward the next one, "13" or "13 · 4/9". The plaques and their rivet rows are #177's.
 */
import { majorOf, minorsPerMajor, pipOf } from '../economy/upgradeSteps'

export function stepLevelText(step: number): string {
  const pip = pipOf(step)
  if (pip === 0) return String(majorOf(step))
  return `${majorOf(step)} · ${pip}/${minorsPerMajor() - 1}`
}
