/**
 * The #385 income cap as the `balance:tree` lane prints it: per planet and item, its worst median
 * over the visits and bands, after the trip cap and before it (ruling 6167240683 asks for both),
 * whether play holds it to the cap, and why it fails or is known to; a planet no seed counts any
 * item on reads so.
 */
import { isFailing, type IncomeCapVerdict } from './incomeCapCheck'
import { TREE_ECONOMY, type IncomeCap } from './treeEconomy'

export function incomeCapTableOf(
  verdicts: readonly IncomeCapVerdict[],
  cap: IncomeCap = TREE_ECONOMY.incomeCap,
): string {
  return [
    '| planet | income item | worst trip share | before the clamp | at | seed shares there | cap | trip ledger in play | |',
    '|---|---|---|---|---|---|---|---|---|',
    ...cap.planets.flatMap((planetIndex) => planetLinesOf(planetIndex, verdicts, cap)),
  ].join('\n')
}

/** Whole basis points as a percent with two decimals: 1500 reads 15.00%. */
export function basisPointsText(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100)
  const hundredths = String(basisPoints % 100).padStart(2, '0')
  return `${whole}.${hundredths}%`
}

function planetLinesOf(
  planetIndex: number,
  verdicts: readonly IncomeCapVerdict[],
  cap: IncomeCap,
): string[] {
  const onPlanet = verdicts.filter((verdict) => verdict.planetIndex === planetIndex)
  if (onPlanet.length === 0) return [`| P${planetIndex} | no live income item | | | | | | | |`]
  return itemIdsOf(onPlanet).map((itemId) =>
    worstLineOf(worstOf(onPlanet.filter((verdict) => verdict.itemId === itemId)), cap),
  )
}

function itemIdsOf(verdicts: readonly IncomeCapVerdict[]): string[] {
  return [...new Set(verdicts.map((verdict) => verdict.itemId))].sort()
}

/** The verdict furthest over before the clamp, then after it. */
function worstOf(verdicts: readonly IncomeCapVerdict[]): IncomeCapVerdict {
  return verdicts.reduce((worst, each) => (isWorse(each, worst) ? each : worst))
}

function isWorse(each: IncomeCapVerdict, worst: IncomeCapVerdict): boolean {
  if (each.medianUnclampedBp !== worst.medianUnclampedBp) {
    return each.medianUnclampedBp > worst.medianUnclampedBp
  }
  return each.medianShareBp > worst.medianShareBp
}

function worstLineOf(verdict: IncomeCapVerdict, cap: IncomeCap): string {
  const seeds = verdict.seedShareBps.map(basisPointsText).join(' / ')
  const ledger = verdict.isTripCappedInPlay ? 'yes' : 'no'
  return (
    `| P${verdict.planetIndex} | ${verdict.itemId} | ${basisPointsText(verdict.medianShareBp)} | ` +
    `${basisPointsText(verdict.medianUnclampedBp)} | ${verdict.visit}, band ${verdict.band} | ` +
    `${seeds} | ${basisPointsText(cap.maxShareBp)} | ${ledger} | ${markOf(verdict)} |`
  )
}

function markOf(verdict: IncomeCapVerdict): string {
  if (!isFailing(verdict)) return ''
  const miss = verdict.isOverCap ? 'over the cap' : 'over the cap unclamped, unheld in play'
  return verdict.knownRedBecause === null ? miss : `known-red (${miss}): ${verdict.knownRedBecause}`
}
