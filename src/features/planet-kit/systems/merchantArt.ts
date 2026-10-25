/**
 * The merchant frontages (`merchantArt.json`, ticket 825): one platform asset per authored merchant,
 * bolted onto the Assay & Exchange in its frame, so the planet's identity reads at the merchant
 * (GD lock of 24 Oct: one merchant system, variants as data). The frontage's colour is the planet's
 * horizon from the registry row the star map card draws (#795/#796, `render/merchantLook.ts`).
 * Render-only: nothing here reaches the authority state, a snapshot or a digest.
 */
import { kebabOf } from '../../../systems/art/artIds'
import type { ArtAsset } from '../../../systems/registries/artAssets'
import type { PlanetId } from '../../solar-systems'
import artFile from '../merchantArt.json'
import { PLANET_KITS } from './planetKitRows'
import { isPlainMap, isPlanetId, isText, KEBAB_ID } from './planetKitRowShape'
import { isSamePlanet } from './planetKitSales'
import type { MerchantRow } from './planetKitTypes'

export interface MerchantFrontage {
  planet: PlanetId
  assetId: string
  /** The merchant's trade as the shingle's device (`crucible`). */
  device: string
  deviceLine: string
}

export interface MerchantArt {
  /** The shop building the frontages bolt onto. */
  host: 'sell'
  /** The one part the code can move: the banner on the roof terrace. */
  bannerPartId: string
  frontages: readonly MerchantFrontage[]
}

/** #52: the id's prefix is its category; a frontage stands on the platform. */
const FRONTAGE_CATEGORY = 'platform'
const FRONTAGE_PREFIX = 'platform-merchant-'
/** The first system's merchants are authored by place; a later system's planets wear templates (#824). */
const AUTHORED_SYSTEM = '1'

/** `platform-merchant-<place>` for a first-system planet; null for a planet with no authored art. */
export function merchantFrontageAssetIdOf(planet: PlanetId): string | null {
  return planet.system === AUTHORED_SYSTEM ? `${FRONTAGE_PREFIX}${kebabOf(planet.planet)}` : null
}

/** Why the file is not the merchant art for these merchants; empty when it is. */
export function merchantArtProblems(file: unknown, merchants: readonly MerchantRow[]): string[] {
  if (!isPlainMap(file) || !Array.isArray(file.frontages))
    return ['merchantArt.json needs frontages']
  return [
    ...(file.host === 'sell' ? [] : ['merchantArt.json host must be "sell"']),
    ...(isText(file.bannerPartId) && KEBAB_ID.test(file.bannerPartId)
      ? []
      : ['merchantArt.json bannerPartId must be a kebab-case part id']),
    ...file.frontages.flatMap((row: unknown, at: number) =>
      frontageProblems(row, merchants, `frontages[${at}]`),
    ),
    ...coverageProblems(file.frontages, merchants),
  ]
}

export function loadMerchantArt(file: unknown, merchants: readonly MerchantRow[]): MerchantArt {
  const problems = merchantArtProblems(file, merchants)
  if (problems.length > 0) throw new Error(`merchant art refused:\n${problems.join('\n')}`)
  return file as MerchantArt
}

export const MERCHANT_ART: MerchantArt = loadMerchantArt(artFile, PLANET_KITS.merchants)

/** The frontage of the merchant on `planet`; null where none is authored. */
export function merchantFrontageOf(art: MerchantArt, planet: PlanetId): MerchantFrontage | null {
  return art.frontages.find((frontage) => isSamePlanet(frontage.planet, planet)) ?? null
}

/** What the slice registers: one platform asset per frontage, the banner beyond the shell (#214). */
export function merchantArtAssets(art: MerchantArt): ArtAsset[] {
  return art.frontages.map((frontage) => ({
    id: frontage.assetId,
    category: FRONTAGE_CATEGORY,
    parts: [art.bannerPartId],
  }))
}

function frontageProblems(
  row: unknown,
  merchants: readonly MerchantRow[],
  where: string,
): string[] {
  if (!isPlainMap(row)) return [`${where} must be a frontage row`]
  if (!isPlanetId(row.planet)) return [`${where}.planet must be a planet id { system, planet }`]
  const planet = row.planet
  return [
    ...(merchants.some((merchant) => isSamePlanet(merchant.planet, planet))
      ? []
      : [`${where}.planet has no merchant in planetKits.json`]),
    ...assetIdProblems(row.assetId, planet, where),
    ...(isText(row.device) && KEBAB_ID.test(row.device)
      ? []
      : [`${where}.device must be a kebab-case device`]),
    ...(isText(row.deviceLine) ? [] : [`${where}.deviceLine must describe the device`]),
  ]
}

function assetIdProblems(assetId: unknown, planet: PlanetId, where: string): string[] {
  const wanted = merchantFrontageAssetIdOf(planet)
  if (wanted === null) return [`${where}.planet is outside the authored system ${AUTHORED_SYSTEM}`]
  return assetId === wanted ? [] : [`${where}.assetId must be "${wanted}"`]
}

/** Every first-system merchant has one frontage, and no merchant has two. */
function coverageProblems(frontages: unknown[], merchants: readonly MerchantRow[]): string[] {
  const planets = frontages
    .filter(isPlainMap)
    .map((row) => row.planet)
    .filter(isPlanetId)
  return merchants
    .filter((merchant) => merchant.planet.system === AUTHORED_SYSTEM)
    .flatMap((merchant) => {
      const count = planets.filter((planet) => isSamePlanet(planet, merchant.planet)).length
      return count === 1 ? [] : [`merchant "${merchant.name}" has ${count} frontages, not one`]
    })
}
