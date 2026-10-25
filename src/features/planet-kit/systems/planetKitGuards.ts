/**
 * The cross-row rules of the planet kits (ticket 820, the GD lock of 24 Oct): the merchants run
 * from planet 1 with no gap, each buys its own planet's pool and pays the premium on one uncommon
 * species of that pool reachable from band 1 on the first trip; each planet has one kit item,
 * hooked on that planet's #651 hazard (none on planet 1); a tool is sold at home and later, a
 * consumable at home only, with the one carry limit and a price rule of its own; and no item's
 * behaviour repeats a first-system id (emp mite, the magnetic planets, the frost spitter, the
 * hazards) or an SS2-B family (#780). The table is judged against facts the ores, materials and
 * solar-systems slices hold, passed in as a context so a spec can plant its own.
 */
import type { HazardEffect } from '../../ores'
import type { PlanetKitEconomy } from './planetKitEconomy'
import { isSamePlanet, stockOfMerchant } from './planetKitSales'
import type { KitItem, MerchantRow } from './planetKitTypes'

export interface KitPlanetFacts {
  planetIndex: number
  pool: string | null
  hazardKind: string | null
  hazardEffect: HazardEffect | null
}

export interface KitSpeciesFacts {
  id: string
  pool: string
  epithet: string
  rarity: string
  /** The first band the species lies in. */
  firstBand: number
}

export interface PlanetKitGuardContext {
  /** The first system's planet rows, planet 1 first. */
  planets: readonly KitPlanetFacts[]
  species: readonly KitSpeciesFacts[]
  /** Every behaviour effect the first system and the SS2-B families already own. */
  takenBehaviours: readonly string[]
  /** Every hazard or family id a planet can carry: the first system's hazards, the roster's families. */
  kitFamilyIds: readonly string[]
}

const FIRST_SYSTEM = '1'
const PREMIUM_RARITY = 'uncommon'
const FIRST_BAND = 1

/** Every way the typed rows break the kit rules; empty when they keep them. */
export function kitTableProblems(
  merchants: readonly MerchantRow[],
  items: readonly KitItem[],
  economy: PlanetKitEconomy,
  context: PlanetKitGuardContext,
): string[] {
  return [
    ...merchantPlanetProblems(merchants),
    ...unique(
      merchants.map((m) => m.name),
      'merchant name',
    ),
    ...merchants.flatMap((merchant) => merchantPoolProblems(merchant, context)),
    ...premiumProblems(merchants, context),
    ...unique(
      items.map((item) => item.id),
      'item id',
    ),
    ...itemHomeProblems(merchants, items),
    ...items.flatMap(itemSaleProblems),
    ...items.flatMap((item) => itemStackProblems(item, economy)),
    ...consumablePriceProblems(items, economy),
    ...heldFromSaleProblems(items, economy),
    ...items.flatMap((item) => itemHazardProblems(item, context)),
    ...merchants.flatMap((merchant) => stockProblems(merchant, items)),
    ...behaviourProblems(items, context),
  ]
}

/** The first system's merchants, planets 1, 2, 3... in order. */
function merchantPlanetProblems(merchants: readonly MerchantRow[]): string[] {
  return merchants.flatMap((merchant, at) => {
    const expected = { system: FIRST_SYSTEM, planet: String(at + 1) }
    if (isSamePlanet(merchant.planet, expected)) return []
    return [
      `merchants[${at}] is planet (${merchant.planet.system},${merchant.planet.planet}); expected (1,${at + 1})`,
    ]
  })
}

function merchantPoolProblems(merchant: MerchantRow, context: PlanetKitGuardContext): string[] {
  const facts = planetFactsOf(merchant.planet.planet, context)
  if (facts === null)
    return [`${merchant.name}: planet ${merchant.planet.planet} has no planet row`]
  if (facts.pool === merchant.buysPool) return []
  return [`${merchant.name} buys pool ${merchant.buysPool}; its planet's pool is ${facts.pool}`]
}

function premiumProblems(
  merchants: readonly MerchantRow[],
  context: PlanetKitGuardContext,
): string[] {
  return [
    ...unique(
      merchants.map((m) => m.premiumOre.speciesId),
      'premium ore',
    ),
    ...merchants.flatMap((merchant) => premiumSpeciesProblems(merchant, context)),
  ]
}

/** The premium ore is an uncommon species of the merchant's own pool, lying in band 1. */
function premiumSpeciesProblems(merchant: MerchantRow, context: PlanetKitGuardContext): string[] {
  const species = context.species.find((row) => row.id === merchant.premiumOre.speciesId)
  if (species === undefined)
    return [`${merchant.name}: no species ${merchant.premiumOre.speciesId}`]
  return [
    ...(species.pool === merchant.buysPool
      ? []
      : [
          `${merchant.name}: premium ore ${species.id} is of pool ${species.pool}, not ${merchant.buysPool}`,
        ]),
    ...(species.rarity === PREMIUM_RARITY
      ? []
      : [
          `${merchant.name}: premium ore ${species.id} is ${species.rarity}, not ${PREMIUM_RARITY}`,
        ]),
    ...(species.firstBand === FIRST_BAND
      ? []
      : [
          `${merchant.name}: premium ore ${species.id} starts in band ${species.firstBand}, not reachable on the first trip`,
        ]),
  ]
}

/** One kit item per merchant, and every item's home has a merchant. */
function itemHomeProblems(merchants: readonly MerchantRow[], items: readonly KitItem[]): string[] {
  return [
    ...items
      .filter((item) => !merchants.some((m) => isSamePlanet(m.planet, item.homePlanet)))
      .map(
        (item) =>
          `${item.id}: no merchant on its home planet (${item.homePlanet.system},${item.homePlanet.planet})`,
      ),
    ...merchants.flatMap((merchant) => {
      const own = items.filter((item) => isSamePlanet(item.homePlanet, merchant.planet))
      return own.length === 1 ? [] : [`${merchant.name} has ${own.length} kit items; expected one`]
    }),
  ]
}

/** The GD lock: a consumable is sold at home only, a tool at home and every later merchant. */
function itemSaleProblems(item: KitItem): string[] {
  const expected = item.kind === 'consumable' ? 'home-only' : 'home-and-later'
  return item.sale === expected
    ? []
    : [`${item.id}: a ${item.kind} is sold ${expected}, not ${item.sale}`]
}

function itemStackProblems(item: KitItem, economy: PlanetKitEconomy): string[] {
  if (item.kind === 'tool') return []
  if (item.stackLimit === economy.consumableCarryLimit) return []
  return [
    `${item.id}: stack limit ${item.stackLimit} is not the carry limit ${economy.consumableCarryLimit}`,
  ]
}

/** Every consumable has its own price share, and every share names a consumable. */
function consumablePriceProblems(items: readonly KitItem[], economy: PlanetKitEconomy): string[] {
  const consumables = items.filter((item) => item.kind === 'consumable').map((item) => item.id)
  return [
    ...consumables
      .filter((id) => !economy.consumablePrices.has(id))
      .map((id) => `${id}: no consumables.runValueShare in the kits' economy`),
    ...[...economy.consumablePrices.keys()]
      .filter((id) => !consumables.includes(id))
      .map((id) => `consumables.runValueShare.${id} names no consumable kit item`),
  ]
}

/** Every item held from sale is a kit item. */
function heldFromSaleProblems(items: readonly KitItem[], economy: PlanetKitEconomy): string[] {
  const ids = items.map((item) => item.id)
  return [...economy.heldFromSale]
    .filter((id) => !ids.includes(id))
    .map((id) => `heldFromSale.${id} names no kit item`)
}

/** The item hooks on its home planet's hazard, or on none where the planet has none. */
function itemHazardProblems(item: KitItem, context: PlanetKitGuardContext): string[] {
  const facts = planetFactsOf(item.homePlanet.planet, context)
  if (facts === null) return []
  return [
    ...(item.effect.hazard === facts.hazardKind
      ? []
      : [
          `${item.id}: hooks hazard ${item.effect.hazard}; its home planet has ${facts.hazardKind}`,
        ]),
    ...(item.effect.hazardEffect === facts.hazardEffect
      ? []
      : [
          `${item.id}: names hazard effect ${item.effect.hazardEffect}; the hazard's is ${facts.hazardEffect}`,
        ]),
  ]
}

/** The authored stock is what the sale rule derives, in debut order. */
function stockProblems(merchant: MerchantRow, items: readonly KitItem[]): string[] {
  const derived = stockOfMerchant(items, merchant.planet)
  if (derived.join(' ') === merchant.stock.join(' ')) return []
  return [
    `${merchant.name} stocks [${merchant.stock.join(', ')}]; the sale rule gives [${derived.join(', ')}]`,
  ]
}

/** No repeats: each behaviour is its own and none the first system or SS2-B already has. */
function behaviourProblems(items: readonly KitItem[], context: PlanetKitGuardContext): string[] {
  return [
    ...unique(
      items.map((item) => item.effect.behaviour),
      'behaviour',
    ),
    ...items
      .filter((item) => context.takenBehaviours.includes(item.effect.behaviour))
      .map((item) => `${item.id}: behaviour ${item.effect.behaviour} repeats earlier content`),
  ]
}

function planetFactsOf(planet: string, context: PlanetKitGuardContext): KitPlanetFacts | null {
  return context.planets.find((facts) => String(facts.planetIndex) === planet) ?? null
}

function unique(values: readonly string[], what: string): string[] {
  return values
    .filter((value, at) => values.indexOf(value) !== at)
    .filter((value, at, repeats) => repeats.indexOf(value) === at)
    .map((value) => `${what} ${value} appears more than once`)
}
