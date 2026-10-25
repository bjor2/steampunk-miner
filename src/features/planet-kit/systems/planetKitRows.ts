/**
 * The planet kits table (ticket 820, spec #647): `planetKits.json` rows and
 * `planet-kit.economy.json` numbers, read once and refused whole when broken, so a bad row fails
 * at load (and in its unit test) with every problem listed. The rows are data only: PK2 (#821)
 * draws the merchants on the #175 shops, PK4 (#823) builds the items and claims their stats.json
 * rows, PK5 (#824) copies the rows into the #777 generator tables. Nothing here registers.
 */
import { fromCanonical } from '../../../systems/money'
import { MATERIALS } from '../../materials'
import { ORE_ROWS } from '../../ores'
import { ARCHETYPE_PALETTE, FIRST_SYSTEM_BEHAVIOURS } from '../../solar-systems'
import economyFile from '../planet-kit.economy.json'
import kitsFile from '../planetKits.json'
import {
  planetKitEconomyOf,
  planetKitEconomyProblems,
  type KitPriceRule,
  type PlanetKitEconomy,
} from './planetKitEconomy'
import {
  kitTableProblems,
  type KitPlanetFacts,
  type KitSpeciesFacts,
  type PlanetKitGuardContext,
} from './planetKitGuards'
import {
  isPlainMap,
  isText,
  kitItemRowShapeProblems,
  merchantRowShapeProblems,
  type KitItemKind,
  type KitSale,
  type Raw,
  type TradeOffCost,
} from './planetKitRowShape'
import { PREMIUM_TAG_SLOT } from './planetKitSales'
import type { KitEffect, KitItem, MerchantRow, PlanetKits } from './planetKitTypes'

const FILE_FIELDS: readonly string[] = ['source', 'premiumTag', 'merchants', 'items']

/** The facts of the ores, materials and solar-systems slices the kit rows are judged against. */
export function planetKitGuardContext(): PlanetKitGuardContext {
  return {
    planets: ORE_ROWS.planets.rows.map(planetFactsOf),
    species: MATERIALS.materials.map(speciesFactsOf),
    takenBehaviours: [
      ...FIRST_SYSTEM_BEHAVIOURS.map((behaviour) => behaviour.effect),
      ...ARCHETYPE_PALETTE.newContent.families.map((family) => family.behaviour.effect),
    ],
  }
}

/** Why the files are not the planet kits; empty when they are. */
export function planetKitProblems(
  file: unknown,
  economy: unknown,
  context: PlanetKitGuardContext,
): string[] {
  const economyProblems = planetKitEconomyProblems(economy)
  if (economyProblems.length > 0) return economyProblems
  const shapeProblems = fileShapeProblems(file)
  if (shapeProblems.length > 0) return shapeProblems
  return typedTableProblems(file as Raw, planetKitEconomyOf(economy as Raw), context)
}

/** The table, or a throw listing every problem. */
export function loadPlanetKits(
  file: unknown,
  economy: unknown,
  context: PlanetKitGuardContext,
): PlanetKits {
  const problems = planetKitProblems(file, economy, context)
  if (problems.length > 0) throw new Error(`planet kits refused:\n${problems.join('\n')}`)
  return planetKitsOf(file as Raw, planetKitEconomyOf(economy as Raw), context)
}

export const PLANET_KITS: PlanetKits = loadPlanetKits(
  kitsFile,
  economyFile,
  planetKitGuardContext(),
)

/** The kits' numbers, read after `PLANET_KITS` refused a broken file: the container caps' source. */
export const PLANET_KIT_ECONOMY: PlanetKitEconomy = planetKitEconomyOf(economyFile as Raw)

function typedTableProblems(
  file: Raw,
  economy: PlanetKitEconomy,
  context: PlanetKitGuardContext,
): string[] {
  const merchants = (file.merchants as Raw[]).map((row) => merchantOf(row, context))
  const items = (file.items as Raw[]).map((row) => kitItemOf(row, economy))
  return kitTableProblems(merchants, items, economy, context)
}

function planetKitsOf(
  file: Raw,
  economy: PlanetKitEconomy,
  context: PlanetKitGuardContext,
): PlanetKits {
  return {
    premiumTag: file.premiumTag as string,
    premiumLiftBp: economy.premiumLiftBp,
    awayMarkup: economy.awayMarkup,
    heldFromSale: economy.heldFromSale,
    merchants: (file.merchants as Raw[]).map((row) => merchantOf(row, context)),
    items: (file.items as Raw[]).map((row) => kitItemOf(row, economy)),
  }
}

function fileShapeProblems(file: unknown): string[] {
  if (!isPlainMap(file)) return ['planetKits.json must be an object']
  return [
    ...premiumTagProblems(file.premiumTag),
    ...rowListProblems(file.merchants, 'merchants', merchantRowShapeProblems),
    ...rowListProblems(file.items, 'items', kitItemRowShapeProblems),
    ...Object.keys(file)
      .filter((field) => !FILE_FIELDS.includes(field))
      .map((field) => `${field} is not a field of planetKits.json`),
  ]
}

function premiumTagProblems(tag: unknown): string[] {
  if (!isText(tag)) return ['premiumTag must be text']
  return tag.includes(PREMIUM_TAG_SLOT) ? [] : [`premiumTag must hold ${PREMIUM_TAG_SLOT}`]
}

function rowListProblems(
  rows: unknown,
  where: string,
  rowProblems: (row: Raw, where: string) => string[],
): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return [`${where} must be a non-empty list`]
  return rows.flatMap((row, at) =>
    isPlainMap(row) ? rowProblems(row, `${where}[${at}]`) : [`${where}[${at}] must be a row`],
  )
}

function merchantOf(row: Raw, context: PlanetKitGuardContext): MerchantRow {
  const speciesId = row.premiumOre as string
  const species = context.species.find((facts) => facts.id === speciesId)
  return {
    planet: row.planet as MerchantRow['planet'],
    name: row.name as string,
    buysPool: (row.buys as Raw).pool as string,
    premiumOre: { speciesId, epithet: species?.epithet ?? speciesId },
    stock: row.stock as string[],
  }
}

function kitItemOf(row: Raw, economy: PlanetKitEconomy): KitItem {
  const kind = row.kind as KitItemKind
  const tradeOff = row.tradeOff as Raw
  return {
    id: row.id as string,
    name: row.name as string,
    hoverLine: row.hoverLine as string,
    kind,
    homePlanet: row.homePlanet as KitItem['homePlanet'],
    sale: row.sale as KitSale,
    stackLimit: kind === 'consumable' ? (row.stackLimit as number) : null,
    price: priceRuleOf(row.id as string, kind, economy),
    effect: row.effect as KitEffect,
    tradeOff: { costs: tradeOff.costs as TradeOffCost, summary: tradeOff.summary as string },
  }
}

/** A tool's rule is shared; a consumable's is its own, or a zero share where the economy has none. */
function priceRuleOf(id: string, kind: KitItemKind, economy: PlanetKitEconomy): KitPriceRule {
  if (kind === 'tool') return economy.tools
  return (
    economy.consumablePrices.get(id) ?? {
      runValueShare: fromCanonical('0'),
      paceScaled: false,
      pricedAt: 'buyer',
    }
  )
}

function planetFactsOf(row: (typeof ORE_ROWS.planets.rows)[number]): KitPlanetFacts {
  const kind = row.hazard?.kind ?? null
  return {
    planetIndex: row.planetIndex,
    pool: row.pool,
    hazardKind: kind,
    hazardEffect: kind === null ? null : (ORE_ROWS.planets.hazards[kind]?.effect ?? null),
  }
}

function speciesFactsOf(row: (typeof MATERIALS.materials)[number]): KitSpeciesFacts {
  return {
    id: row.id,
    pool: row.pool,
    epithet: row.epithet,
    rarity: row.rarity,
    firstBand: row.gradeBand[0],
  }
}
