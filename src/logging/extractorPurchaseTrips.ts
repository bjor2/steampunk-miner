/**
 * When the bot bought each extractor, read from a run's events only (#142 acceptance 7, ticket
 * 296): the planet of the `vehicle_item_purchased` line and the trips it had ended there before
 * it. A trip ends when the vehicle comes back to the Sell bay (`dock_entered {bay: sell}`); a
 * drive over to the Upgrade bay leaves and enters a bay too, so it never counts. `balance:charges`
 * expects every seed to buy each extractor on its own planet by the end of trip 4.
 *
 * The extractors are named by the caller (the mining-gates debug action): the kernel never
 * imports a slice.
 */
import type { RunEvent } from './runEvent'

export const MAX_TRIPS_BEFORE_EXTRACTOR = 4

/** An extractor and the planet it is first sold on. */
export interface ExtractorOnSale {
  id: string
  planet: number
}

/** Where a seed's bot bought an extractor; null fields when it never did. */
export interface ExtractorPurchase {
  planet: number | null
  tripsBefore: number | null
}

export interface ExtractorPurchaseRow {
  extractor: ExtractorOnSale
  /** One per seed, in seed order. */
  bySeed: readonly ExtractorPurchase[]
}

const NEVER_BOUGHT: ExtractorPurchase = { planet: null, tripsBefore: null }

/** Each extractor's purchase in one run, by extractor id. */
export function extractorPurchasesOf(
  events: readonly RunEvent[],
  extractors: readonly ExtractorOnSale[],
): Map<string, ExtractorPurchase> {
  const ids = new Set(extractors.map((extractor) => extractor.id))
  const tripsByPlanet = new Map<number, number>()
  const bought = new Map<string, ExtractorPurchase>()
  for (const event of events) {
    if (isTripEnd(event)) tripsByPlanet.set(event.planet, tripsOn(tripsByPlanet, event.planet) + 1)
    const itemId = boughtItemIdOf(event)
    if (itemId === null || !ids.has(itemId) || bought.has(itemId)) continue
    bought.set(itemId, { planet: event.planet, tripsBefore: tripsOn(tripsByPlanet, event.planet) })
  }
  return bought
}

/** One row per extractor sold within the run's planets, from each seed's purchases in order. */
export function extractorPurchaseRowsOf(
  bySeed: readonly ReadonlyMap<string, ExtractorPurchase>[],
  extractors: readonly ExtractorOnSale[],
): ExtractorPurchaseRow[] {
  return extractors.map((extractor) => ({
    extractor,
    bySeed: bySeed.map((purchases) => purchases.get(extractor.id) ?? NEVER_BOUGHT),
  }))
}

export function extractorPurchaseTableOf(
  rows: readonly ExtractorPurchaseRow[],
  seeds: readonly number[],
): string {
  return [
    `| extractor | planet | ${seeds.join(' | ')} | by trip ${MAX_TRIPS_BEFORE_EXTRACTOR} on its planet |`,
    `| --- | --- | ${seeds.map(() => '---').join(' | ')} | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.extractor.id} | ${row.extractor.planet} | ${row.bySeed.map((purchase) => purchaseText(row.extractor, purchase)).join(' | ')} | ${isEverySeedOnTime(row) ? 'yes' : 'no'} |`,
    ),
  ].join('\n')
}

/** A line per extractor some seed bought late, elsewhere or never. */
export function extractorPurchaseWarnings(rows: readonly ExtractorPurchaseRow[]): string[] {
  return rows
    .filter((row) => !isEverySeedOnTime(row))
    .map(
      ({ extractor }) =>
        `${extractor.id}: not bought on planet ${extractor.planet} by trip ${MAX_TRIPS_BEFORE_EXTRACTOR} on every seed`,
    )
}

function isEverySeedOnTime(row: ExtractorPurchaseRow): boolean {
  return row.bySeed.every((purchase) => isOnTime(row.extractor, purchase))
}

function isOnTime(extractor: ExtractorOnSale, purchase: ExtractorPurchase): boolean {
  if (purchase.planet !== extractor.planet || purchase.tripsBefore === null) return false
  return purchase.tripsBefore <= MAX_TRIPS_BEFORE_EXTRACTOR
}

function purchaseText(extractor: ExtractorOnSale, purchase: ExtractorPurchase): string {
  if (purchase.planet === null) return 'never'
  if (purchase.planet !== extractor.planet) return `planet ${purchase.planet}`
  return `after trip ${purchase.tripsBefore}`
}

function isTripEnd(event: RunEvent): boolean {
  return event.event === 'dock_entered' && (event.data as { bay?: string }).bay === 'sell'
}

function boughtItemIdOf(event: RunEvent): string | null {
  if (event.event !== 'vehicle_item_purchased') return null
  return (event.data as { itemId?: string }).itemId ?? null
}

function tripsOn(tripsByPlanet: ReadonlyMap<number, number>, planet: number): number {
  return tripsByPlanet.get(planet) ?? 0
}
