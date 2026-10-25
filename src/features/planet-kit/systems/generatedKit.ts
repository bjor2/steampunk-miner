/**
 * Every planet's kit from data alone (ticket 824, PK5 under spec #647): the authored P1-P5 kits
 * (#820) where they stand, and for a planet past the first system the row of the hazard or family
 * the roster gives it (`familyKitRows.ts`), with no per-planet code.
 *
 * - **Composition only** (TD final on Q1, HS condition 2). The kit names the merchant, its variant,
 *   the family, the premium ore and the item or none; nothing keys on g, so it is pure in
 *   (worldSeed, s, p) and the same whatever order planets are read in. Prices are read at g by
 *   `planetKitPrices.ts`.
 * - **Authored wins** (HS condition 3). The generator fills only the planets the palette draws
 *   (system 2 on); a first-system planet without an authored merchant has no kit.
 * - **Name** (Progression on Q3): `<planetName> <variantNoun>` within the #680 title budget and
 *   `NAME_CHARACTERS_MAX`, else `The <variantNoun>`.
 * - **Premium** (GD and Systems on Q3, Progression's reach condition): one kind of the planet's own
 *   #777 pool of the rule's rarities lying in a band up to its reach band, picked by seed; the
 *   shallowest kind where none does. The planet with no new family draws its variant by seed too.
 */
import { TITLE_WORDS_MAX } from '../../../constants/uiParts'
import { hashCell } from '../../../systems/cellRandom'
import { toIndexText } from '../../../systems/starMap/planetAddress'
import { planetSeedAt } from '../../../systems/starMap/planetAddressSeed'
import { wordCountOf } from '../../../systems/views/uiTextBudget'
import {
  FIRST_DRAWN_SYSTEM,
  planetMaterialPoolOf,
  rosterPlanetOf,
  type MaterialPool,
  type PlanetId,
  type PoolKind,
} from '../../solar-systems'
import { PLANET_KITS } from './planetKitRows'
import { isSamePlanet, merchantOfPlanet } from './planetKitSales'
import type {
  FamilyKitRow,
  MerchantRow,
  PlanetKit,
  PlanetKits,
  PremiumOre,
  PremiumRule,
} from './planetKitTypes'

/** Progression on Q3: a generated merchant's name holds at most 24 characters. */
export const NAME_CHARACTERS_MAX = 24
const NAME_WITHOUT_PLANET = 'The'

/**
 * The kit's own draw streams on the planet's address seed; the roster's run 1-8
 * (`rosterDraws.ts`), so these never move a roster pick.
 */
const KIT_STREAM = { premium: 21, variant: 22 } as const

/** The planet's kit; null on a first-system planet no authored merchant stands on. */
export function generatedKitOf(
  worldSeed: number,
  system: bigint,
  planet: bigint,
  kits: PlanetKits = PLANET_KITS,
): PlanetKit | null {
  const id = { system: toIndexText(system), planet: toIndexText(planet) }
  const merchant = merchantOfPlanet(kits, id)
  if (merchant !== null) return authoredKitOf(kits, merchant)
  return system < FIRST_DRAWN_SYSTEM ? null : drawnKitOf(kits, worldSeed, system, planet)
}

/** `<planetName> <variantNoun>`, or `The <variantNoun>` where that passes the name budget. */
export function generatedMerchantNameOf(planetName: string, variant: string): string {
  const name = `${planetName} ${variant}`
  return isWithinNameBudget(name) ? name : `${NAME_WITHOUT_PLANET} ${variant}`
}

function authoredKitOf(kits: PlanetKits, merchant: MerchantRow): PlanetKit {
  const item = kits.items.find((candidate) => isSamePlanet(candidate.homePlanet, merchant.planet))
  return {
    planet: merchant.planet,
    source: 'authored',
    merchantName: merchant.name,
    merchantVariant: merchant.variant,
    familyId: item?.effect.hazard ?? null,
    premiumOre: merchant.premiumOre,
    itemId: item?.id ?? null,
  }
}

function drawnKitOf(
  kits: PlanetKits,
  worldSeed: number,
  system: bigint,
  planet: bigint,
): PlanetKit {
  const roster = rosterPlanetOf(worldSeed, system, planet)
  const familyId = roster.slot?.id ?? null
  const row = familyKitRowOf(kits, familyId)
  const variant = row?.merchantVariant ?? drawnVariantOf(kits, worldSeed, roster.id)
  const rule = row?.premiumRule ?? kits.familyKits.noFamily.premiumRule
  return {
    planet: roster.id,
    source: 'generated',
    merchantName: generatedMerchantNameOf(roster.name, variant),
    merchantVariant: variant,
    familyId,
    premiumOre: premiumOreOf(planetMaterialPoolOf(worldSeed, system, planet), rule, worldSeed),
    itemId: row?.itemId ?? null,
  }
}

/** The family's row; null for a planet with no new family. The load guard covers every family. */
function familyKitRowOf(kits: PlanetKits, familyId: string | null): FamilyKitRow | null {
  if (familyId === null) return null
  const row = kits.familyKits.rows.find((candidate) => candidate.familyId === familyId)
  if (row === undefined) throw new RangeError(`family ${familyId} has no kit row`)
  return row
}

function drawnVariantOf(kits: PlanetKits, worldSeed: number, planet: PlanetId): string {
  const variants = kits.merchants.map((merchant) => merchant.variant)
  return variants[kitDrawOf(worldSeed, planet, KIT_STREAM.variant) % variants.length]
}

function premiumOreOf(pool: MaterialPool, rule: PremiumRule, worldSeed: number): PremiumOre {
  const reachable = pool.kinds.filter((kind) => isPremiumCandidate(kind, rule))
  const kind =
    reachable.length === 0
      ? shallowestKindOf(pool.kinds)
      : reachable[kitDrawOf(worldSeed, pool.planet, KIT_STREAM.premium) % reachable.length]
  return { speciesId: kind.id, epithet: kind.epithet }
}

function isPremiumCandidate(kind: PoolKind, rule: PremiumRule): boolean {
  return rule.rarities.includes(kind.rarity) && kind.window[0] <= rule.reachBand
}

/** The kind whose window opens highest, the first in pool order (common first) on a tie. */
function shallowestKindOf(kinds: readonly PoolKind[]): PoolKind {
  return kinds.reduce((best, kind) => (kind.window[0] < best.window[0] ? kind : best))
}

function kitDrawOf(worldSeed: number, planet: PlanetId, stream: number): number {
  const seed = planetSeedAt(worldSeed, BigInt(planet.system), BigInt(planet.planet))
  return hashCell(seed, stream, 0)
}

function isWithinNameBudget(name: string): boolean {
  return wordCountOf(name) <= TITLE_WORDS_MAX && name.length <= NAME_CHARACTERS_MAX
}
