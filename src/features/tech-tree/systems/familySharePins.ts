/**
 * The share pins of the #212 report (ticket 371; the gun-track ≤ 5% pin, Vertical Scaler on #322,
 * GD ruling on #371): a spend family may pin part of its spend to a cap on each planet's share.
 * Per planet, per pinned family, the pinned buys' share of what each seed bought there, judged on
 * the median of the seeds like the tree total, on every planet with no window. Read from the kernel
 * `spendFamilies` registry, so the tech tree imports no slice. A seed counts the pinned buys only
 * while the family's anchor row is live on its run; a seed that bought nothing on the planet does
 * not count there.
 */
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { formatPercent } from '../../../systems/displayAmount'
import { add, cmp, div, ZERO_MONEY, type Money } from '../../../systems/money'
import {
  spendFamiliesOf,
  type SpendFamily,
  type SpendSharePin,
} from '../../../systems/registries/spendFamilies'
import type { SeedSpends } from './familySpendShares'
import { medianShareOf } from './treeSpendGuard'

export interface SharePinVerdict {
  planetIndex: number
  familyId: string
  /** The pinned share of each seed that bought anything on the planet, in seed order. */
  seedShares: readonly Money[]
  medianShare: Money
  maxShare: Money
  isOverPin: boolean
}

interface PinnedFamily {
  id: string
  anchorRowId: string
  pin: SpendSharePin
}

/** One verdict per planet any seed bought on per pinned family live on any seed, by planet. */
export function sharePinVerdictsOf(seeds: readonly SeedSpends[]): SharePinVerdict[] {
  const families = pinnedFamiliesOf(seeds)
  return paidPlanetsOf(seeds).flatMap((planetIndex) =>
    families.map((family) => pinVerdictOf(planetIndex, family, seeds)),
  )
}

/** The verdicts whose median share sits above the pin. */
export function brokenPinsOf(verdicts: readonly SharePinVerdict[]): SharePinVerdict[] {
  return verdicts.filter((verdict) => verdict.isOverPin)
}

/** The verdicts as a Markdown table: each seed's share, the median, the pin and a miss mark. */
export function sharePinTableOf(verdicts: readonly SharePinVerdict[]): string {
  return [
    '| planet | pinned family | seed shares | median | pin | |',
    '|---|---|---|---|---|---|',
    ...verdicts.map(pinLineOf),
  ].join('\n')
}

/** Every registered family with a pin whose anchor is live on any seed, in sorted id order. */
function pinnedFamiliesOf(seeds: readonly SeedSpends[]): PinnedFamily[] {
  return spendFamiliesOf()
    .filter((family) => seeds.some((seed) => seed.isAnchorLive(family.anchorRowId)))
    .flatMap(pinnedFamilyOf)
}

function pinnedFamilyOf({ id, anchorRowId, sharePin }: SpendFamily): PinnedFamily[] {
  return sharePin === undefined ? [] : [{ id, anchorRowId, pin: sharePin }]
}

function pinVerdictOf(
  planetIndex: number,
  family: PinnedFamily,
  seeds: readonly SeedSpends[],
): SharePinVerdict {
  const seedShares = seeds.flatMap((seed) => seedPinShareOf(seed, planetIndex, family))
  const medianShare = medianShareOf(seedShares)
  const { maxShare } = family.pin
  const isOverPin = cmp(medianShare, maxShare) > 0
  return { planetIndex, familyId: family.id, seedShares, medianShare, maxShare, isOverPin }
}

/** The pinned buys' share of the seed's planet spend; none when the seed bought nothing there. */
function seedPinShareOf(seed: SeedSpends, planetIndex: number, family: PinnedFamily): Money[] {
  const onPlanet = seed.shopSpend.filter((spend) => spend.planetIndex === planetIndex)
  const total = sumOf(onPlanet)
  if (cmp(total, ZERO_MONEY) <= 0) return []
  return [div(pinnedSpendOf(seed, onPlanet, family), total)]
}

function pinnedSpendOf(
  seed: SeedSpends,
  onPlanet: readonly ShopSpend[],
  family: PinnedFamily,
): Money {
  if (!seed.isAnchorLive(family.anchorRowId)) return ZERO_MONEY
  return sumOf(onPlanet.filter((spend) => family.pin.isPinned(spend)))
}

/** The planets some seed paid for anything on, ascending. */
function paidPlanetsOf(seeds: readonly SeedSpends[]): number[] {
  const planets = seeds.flatMap((seed) => seed.shopSpend.map((spend) => spend.planetIndex))
  return [...new Set(planets)]
    .filter((planetIndex) => isPaidOnByAnySeed(seeds, planetIndex))
    .sort((a, b) => a - b)
}

function isPaidOnByAnySeed(seeds: readonly SeedSpends[], planetIndex: number): boolean {
  return seeds.some((seed) => cmp(paidOn(seed, planetIndex), ZERO_MONEY) > 0)
}

function paidOn(seed: SeedSpends, planetIndex: number): Money {
  return sumOf(seed.shopSpend.filter((spend) => spend.planetIndex === planetIndex))
}

function pinLineOf(verdict: SharePinVerdict): string {
  const seeds = verdict.seedShares.map(formatPercent).join(' / ')
  const mark = verdict.isOverPin ? 'over the pin' : ''
  return (
    `| P${verdict.planetIndex} | ${verdict.familyId} | ${seeds} | ` +
    `${formatPercent(verdict.medianShare)} | ≤ ${formatPercent(verdict.maxShare)} | ${mark} |`
  )
}

function sumOf(spends: readonly ShopSpend[]): Money {
  return spends.map((spend) => spend.cost).reduce(add, ZERO_MONEY)
}
